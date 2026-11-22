import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AiStatus, FileChange, FunctionDetail, FunctionExplanation, Hunk, Line } from "../../api/types";
import FunctionChanges from "../FunctionChanges/FunctionChanges";
import { FileNote, type FileNoteProps } from "../Summary/Summary";
import Pill from "../Pill/Pill";
import { keyName, typing } from "../../shortcuts";
import { wordDiff, type Segment } from "./wordDiff";
import "./FileChanges.css";

// A page of its own for reading a change: the changed files down the left (with a filter and
// the branch's totals), the picked file's change filling the rest, as before and after with
// the changed words marked. Each pane scrolls on its own, so the page itself doesn't grow
// with the size of the change.

const STATUS = {
  added: { label: "New file", tone: "add" },
  deleted: { label: "Removed", tone: "del" },
  modified: { label: "Edited", tone: "mod" },
  renamed: { label: "Moved", tone: "mod" },
} as const;

const FUNCTION_VERB = { added: "Added", deleted: "Removed", modified: "Changed" } as const;

type Layout = "split" | "unified";
// A file's change told function by function, or as the changed lines.
type Mode = "functions" | "lines";

// One column unless the user picked Before | After: in the middle column, two code
// columns wrap almost every line.
function savedLayout(): Layout {
  try {
    return localStorage.getItem("looma-diff-layout") === "split" ? "split" : "unified";
  } catch {
    return "unified";
  }
}

type Props = {
  files: FileChange[];
  // Set from outside (the project map) to open a file and bring the card into view.
  focus?: { path: string; count: number } | null;
  // Says when what was compared changed, so each file's functions are read again.
  version: string;
  // Names what is compared (project, branches), for explanations running in the background.
  scope: string;
  // What a file is for, from the project's knowledge transfer, with a button to ask for it.
  fileNote?: (path: string) => FileNoteProps | null;
  loadFunctions: (file: FileChange) => Promise<FunctionDetail[]>;
  explainFunction: (file: FileChange, name: string) => Promise<FunctionExplanation>;
  ai: AiStatus | null;
  onSignedIn: () => void;
  // Told the file on show, for the breadcrumb.
  onSelect?: (name: string | null) => void;
  // The keys for the next and previous file, from Settings; j and k unless changed.
  keys?: { next?: string; previous?: string };
};

export default function FileChanges({ files, focus, version, scope, fileNote, loadFunctions, explainFunction, ai, onSignedIn, onSelect, keys }: Props) {
  const nextKey = keys?.next ?? "j";
  const previousKey = keys?.previous ?? "k";
  // Real code first, by folder; generated files such as lockfiles go last.
  const ordered = useMemo(
    () =>
      [...files].sort(
        (a, b) => Number(a.generated) - Number(b.generated) || a.path.localeCompare(b.path),
      ),
    [files],
  );
  const [selected, setSelected] = useState(ordered[0]?.path ?? null);
  const [layout, setLayout] = useState<Layout>(savedLayout);
  const [mode, setMode] = useState<Mode>("functions");
  const [query, setQuery] = useState("");
  const narrow = useNarrow();
  const card = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!focus) return;
    setSelected(focus.path);
    card.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus]);
  const index = Math.max(0, ordered.findIndex((file) => file.path === selected));
  const file = ordered[index];
  const shownName = file ? file.path.split("/").pop()! : null;
  useEffect(() => {
    onSelect?.(shownName);
    return () => onSelect?.(null);
  }, [shownName, onSelect]);

  // Keep a selection when the list changes underneath (a new commit, a checkout).
  useEffect(() => {
    if (!ordered.some((f) => f.path === selected)) setSelected(ordered[0]?.path ?? null);
  }, [ordered, selected]);

  useEffect(() => {
    try {
      localStorage.setItem("looma-diff-layout", layout);
    } catch {
      /* storage unavailable */
    }
  }, [layout]);

  // j / k (or the keys set in Settings) step through files, as in most code review tools.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (typing(event)) return;
      const key = keyName(event);
      if (!key) return;
      if (key === nextKey) setSelected(ordered[Math.min(ordered.length - 1, index + 1)]?.path ?? null);
      if (key === previousKey) setSelected(ordered[Math.max(0, index - 1)]?.path ?? null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ordered, index, nextKey, previousKey]);

  if (!file) return null;
  const needle = query.trim().toLowerCase();
  const groups = groupByFolder(needle ? ordered.filter((item) => item.path.toLowerCase().includes(needle)) : ordered);
  const added = ordered.reduce((sum, item) => sum + item.additions, 0);
  const removed = ordered.reduce((sum, item) => sum + item.deletions, 0);
  const tools = (
    <>
      <div className="segmented" role="group" aria-label="Show the change">
        <button className={mode === "functions" ? "is-on" : ""} onClick={() => setMode("functions")}>
          By function
        </button>
        <button className={mode === "lines" ? "is-on" : ""} onClick={() => setMode("lines")}>
          Lines
        </button>
      </div>
      <div className="segmented" role="group" aria-label="Diff layout">
        <button className={layout === "split" ? "is-on" : ""} onClick={() => setLayout("split")} title="Before and after side by side">
          Split
        </button>
        <button className={layout === "unified" ? "is-on" : ""} onClick={() => setLayout("unified")} title="Before and after in one column">
          Unified
        </button>
      </div>
    </>
  );

  return (
    <section className="changes" ref={card}>
      <div className="changes__body">
        <aside className="changes__side">
          <div className="changes__totals">
            <strong>
              {ordered.length} {ordered.length === 1 ? "file" : "files"} changed
            </strong>
            <span>
              <b className="changes__add">+{added.toLocaleString()}</b> <b className="changes__del">−{removed.toLocaleString()}</b>
            </span>
          </div>
          <label className="changes__filter">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5 14 14" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter files"
              aria-label="Filter the changed files"
            />
          </label>
        <nav className="changes__files" aria-label="Changed files">
          {groups.length === 0 && <p className="changes__none">No changed file matches “{query}”.</p>}
          {groups.map((group) => (
            <div key={group.folder} className="changes__group">
              <h3 className="changes__folder">{group.folder || "Project root"}</h3>
              <ul>
                {group.files.map((item) => (
                  <li key={item.path}>
                    <FileButton file={item} active={item.path === file.path} onClick={() => setSelected(item.path)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        </aside>

        <select
          className="select changes__picker"
          value={file.path}
          onChange={(event) => setSelected(event.target.value)}
          aria-label="Changed file"
        >
          {ordered.map((item) => (
            <option key={item.path} value={item.path}>
              {item.path} (+{item.additions} −{item.deletions})
            </option>
          ))}
        </select>

        <FileView
          key={file.path}
          file={file}
          layout={narrow || file.status === "added" || file.status === "deleted" ? "unified" : layout}
          sideBySide={!narrow && layout === "split"}
          // Every text file can be read and explained: code by its functions, styles by their
          // rules, docs by their sections, anything else as a whole file.
          mode={file.binary || file.generated ? "lines" : mode}
          onShowLines={() => setMode("lines")}
          note={fileNote?.(file.path) ?? null}
          functions={{
            version: `${version}:${file.path}:${file.additions}:${file.deletions}`,
            scope: `${scope}:${file.path}:${file.additions}:${file.deletions}`,
            load: () => loadFunctions(file),
            explain: (name) => explainFunction(file, name),
            ai,
            onSignedIn,
          }}
          tools={tools}
          position={`${index + 1} of ${ordered.length}`}
          onPrevious={index > 0 ? () => setSelected(ordered[index - 1].path) : undefined}
          onNext={index < ordered.length - 1 ? () => setSelected(ordered[index + 1].path) : undefined}
        />
      </div>
    </section>
  );
}

function FileButton({ file, active, onClick }: { file: FileChange; active: boolean; onClick: () => void }) {
  const name = file.path.slice(file.path.lastIndexOf("/") + 1);
  const total = file.additions + file.deletions;
  return (
    <button
      className={`changes__file${active ? " changes__file--active" : ""}${file.generated ? " changes__file--generated" : ""}`}
      onClick={onClick}
      aria-current={active || undefined}
      title={file.path}
    >
      <span className={`changes__status changes__status--${STATUS[file.status].tone}`} aria-label={STATUS[file.status].label} />
      <span className="changes__name">{name}</span>
      {file.uncommitted ? <span className="changes__dirty" title="Not committed" /> : <span />}
      <span className="changes__count" aria-label={`${file.additions} added, ${file.deletions} removed`}>
        {total > 0 ? (
          <>
            <b className="changes__add">+{file.additions}</b> <b className="changes__del">−{file.deletions}</b>
          </>
        ) : (
          "0"
        )}
      </span>
    </button>
  );
}

type ViewProps = {
  file: FileChange;
  layout: Layout;
  sideBySide: boolean;
  mode: Mode;
  onShowLines: () => void;
  note: FileNoteProps | null;
  functions: {
    version: string;
    scope: string;
    load: () => Promise<FunctionDetail[]>;
    explain: (name: string) => Promise<FunctionExplanation>;
    ai: AiStatus | null;
    onSignedIn: () => void;
  };
  // The view switches, in the file's toolbar.
  tools: ReactNode;
  position: string;
  onPrevious?: () => void;
  onNext?: () => void;
};

function FileView({ file, layout, sideBySide, mode, onShowLines, note, functions, tools, position, onPrevious, onNext }: ViewProps) {
  const status = STATUS[file.status];
  const slash = file.path.lastIndexOf("/");

  return (
    <article className="changes__view">
      <header className="view__header">
        <div className="view__heading">
          <div className="view__badges">
            <Pill tone={status.tone}>{status.label}</Pill>
            {file.uncommitted && <span className="view__uncommitted">Not committed</span>}
          </div>
          <h3 className="view__path">
            <span className="view__folder">{file.path.slice(0, slash + 1)}</span>
            {file.path.slice(slash + 1)}
          </h3>
          {file.old_path && <p className="view__moved">Moved from {file.old_path}</p>}
          <p className="view__summary">{summary(file)}</p>
        </div>
        <div className="view__nav">
          <div className="view__tools">{tools}</div>
          <span>{position}</span>
          <button onClick={onPrevious} disabled={!onPrevious} aria-label="Previous file" title="Previous file (k)">
            ‹
          </button>
          <button onClick={onNext} disabled={!onNext} aria-label="Next file" title="Next file (j)">
            ›
          </button>
        </div>
      </header>

      {/* What the whole file is for, right above its change, where it's looked for. */}
      {note && <FileNote {...note} />}

      {mode === "lines" && file.functions.length > 0 && (
        <ul className="view__functions">
          {file.functions.map((fn) => (
            <li key={`${fn.change}-${fn.name}`} className={`view__function view__function--${fn.change}`}>
              {FUNCTION_VERB[fn.change]} <code>{fn.name}</code>
            </li>
          ))}
        </ul>
      )}

      <div className="view__diff">
        {mode === "functions" && !file.binary && !file.generated ? (
          <FunctionChanges {...functions} sideBySide={sideBySide} onShowLines={onShowLines} />
        ) : file.binary ? (
          <p className="view__note">This is a binary file, such as an image, so there are no lines to show.</p>
        ) : file.generated ? (
          <p className="view__note">
            Generated file, such as a lockfile. Tools write it, so its {(file.additions + file.deletions).toLocaleString()}{" "}
            changed lines are hidden.
          </p>
        ) : file.hunks.length === 0 ? (
          <p className="view__note">Only the file's name or permissions changed.</p>
        ) : (
          file.hunks.map((hunk, i) => (
            <HunkView
              key={i}
              hunk={hunk}
              previous={file.hunks[i - 1]}
              layout={layout}
              whole={file.status === "added" || file.status === "deleted"}
            />
          ))
        )}
        {file.truncated && <p className="view__note">This change is very long, so only the start is shown.</p>}
      </div>
    </article>
  );
}

// A run of removed lines followed by the added lines that replaced them.
type Block = { kind: "context"; line: Line } | { kind: "change"; removed: Line[]; added: Line[] };

function blocks(lines: Line[]): Block[] {
  const result: Block[] = [];
  for (const line of lines) {
    const last = result[result.length - 1];
    if (line.kind === "context") {
      result.push({ kind: "context", line });
    } else if (last?.kind === "change" && (line.kind === "add" || last.added.length === 0)) {
      (line.kind === "add" ? last.added : last.removed).push(line);
    } else {
      result.push({ kind: "change", removed: line.kind === "delete" ? [line] : [], added: line.kind === "add" ? [line] : [] });
    }
  }
  return result;
}

// whole: the hunk is the entire file (a new or removed file), so it needs no heading.
function HunkView({ hunk, previous, layout, whole }: { hunk: Hunk; previous?: Hunk; layout: Layout; whole: boolean }) {
  const skipped = previous
    ? hunk.old_start - (previous.old_start + previous.old_lines)
    : hunk.old_start - 1;
  const items = blocks(hunk.lines);

  return (
    <section className="hunk">
      {skipped > 0 && (
        <div className="hunk__gap">
          ⋯ {skipped} unchanged line{skipped === 1 ? "" : "s"}
        </div>
      )}
      {!whole && (
        <h4 className="hunk__where">
          {hunk.context ? (
            <>
              In <code>{hunk.context.trim()}</code>
            </>
          ) : (
            `Around line ${hunk.new_start || hunk.old_start}`
          )}
        </h4>
      )}
      <table className={`diff diff--${layout}`}>
        <tbody>
          {items.map((item, i) =>
            item.kind === "context" ? (
              <ContextRow key={i} line={item.line} layout={layout} />
            ) : (
              <ChangeRows key={i} removed={item.removed} added={item.added} layout={layout} />
            ),
          )}
        </tbody>
      </table>
    </section>
  );
}

function ContextRow({ line, layout }: { line: Line; layout: Layout }) {
  if (layout === "unified") {
    return (
      <tr className="diff__row diff__row--context">
        <td className="diff__num">{line.new}</td>
        <td className="diff__code">{line.text || " "}</td>
      </tr>
    );
  }
  return (
    <tr className="diff__row diff__row--context">
      <td className="diff__num">{line.old}</td>
      <td className="diff__code">{line.text || " "}</td>
      <td className="diff__num">{line.new}</td>
      <td className="diff__code">{line.text || " "}</td>
    </tr>
  );
}

function ChangeRows({ removed, added, layout }: { removed: Line[]; added: Line[]; layout: Layout }) {
  // Lines at the same position in the removed and added runs are treated as one line
  // edited, so only the words that differ are marked.
  const pairs = Array.from({ length: Math.max(removed.length, added.length) }, (_, i) => {
    const before = removed[i];
    const after = added[i];
    const words = before && after ? wordDiff(before.text, after.text) : null;
    return { before, after, words };
  });

  if (layout === "unified") {
    return (
      <>
        {pairs
          .filter((pair) => pair.before)
          .map((pair, i) => (
            <tr key={`d${i}`} className="diff__row diff__row--del">
              <td className="diff__num">{pair.before!.old}</td>
              <td className="diff__code">
                <Segments segments={pair.words?.before} text={pair.before!.text} />
              </td>
            </tr>
          ))}
        {pairs
          .filter((pair) => pair.after)
          .map((pair, i) => (
            <tr key={`a${i}`} className="diff__row diff__row--add">
              <td className="diff__num">{pair.after!.new}</td>
              <td className="diff__code">
                <Segments segments={pair.words?.after} text={pair.after!.text} />
              </td>
            </tr>
          ))}
      </>
    );
  }

  return (
    <>
      {pairs.map((pair, i) => (
        <tr key={i} className="diff__row">
          <td className={`diff__num${pair.before ? " diff__num--del" : " diff__empty"}`}>{pair.before?.old}</td>
          <td className={`diff__code${pair.before ? " diff__code--del" : " diff__empty"}`}>
            {pair.before && <Segments segments={pair.words?.before} text={pair.before.text} />}
          </td>
          <td className={`diff__num${pair.after ? " diff__num--add" : " diff__empty"}`}>{pair.after?.new}</td>
          <td className={`diff__code${pair.after ? " diff__code--add" : " diff__empty"}`}>
            {pair.after && <Segments segments={pair.words?.after} text={pair.after.text} />}
          </td>
        </tr>
      ))}
    </>
  );
}

function Segments({ segments, text }: { segments?: Segment[]; text: string }) {
  if (!segments) return <>{text || " "}</>;
  return (
    <>
      {segments.map((segment, i) =>
        segment.changed ? (
          <mark key={i} className="diff__word">
            {segment.text}
          </mark>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  );
}

// Two columns of code don't fit a phone, so narrow screens always get one.
function useNarrow() {
  const query = "(max-width: 820px)";
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setNarrow(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

function groupByFolder(files: FileChange[]) {
  const groups: { folder: string; files: FileChange[] }[] = [];
  for (const file of files) {
    const folder = file.generated ? "Generated files" : file.path.slice(0, file.path.lastIndexOf("/") + 1);
    const group = groups.find((g) => g.folder === folder);
    if (group) group.files.push(file);
    else groups.push({ folder, files: [file] });
  }
  return groups;
}

// One plain sentence a non-developer can read without opening the lines.
function summary(file: FileChange) {
  const lines = (n: number) => `${n.toLocaleString()} line${n === 1 ? "" : "s"}`;
  if (file.binary) return file.status === "added" ? "A new binary file." : "A binary file changed.";
  if (file.status === "added") return `A new file with ${lines(file.additions)}.`;
  if (file.status === "deleted") return `The whole file was removed (${lines(file.deletions)}).`;
  const parts = [];
  if (file.additions) parts.push(`${lines(file.additions)} added`);
  if (file.deletions) parts.push(`${lines(file.deletions)} removed`);
  const where = file.hunks.length > 1 ? ` in ${file.hunks.length} places` : "";
  return parts.length ? `${parts.join(", ")}${where}.` : "No line changes.";
}
