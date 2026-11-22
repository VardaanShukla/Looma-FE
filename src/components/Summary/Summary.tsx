import { useEffect, useState } from "react";
import type { AiStatus, FileExplanation, KtDetail, KtGuide, ProjectExplanation, Summary as SummaryData } from "../../api/types";
import { languageColor } from "../ProjectMap/ProjectMap";
import ClaudeSetup from "../ClaudeSignIn/ClaudeSetup";
import { clear, job, result, since, start, useJobs } from "../../lib/aiJobs";
import { downloadGuide } from "./ktPdf";
import DetailedKt from "./DetailedKt";
import Loading, { Progress } from "../Loading/Loading";
import "./Summary.css";

// The whole project on one screen: what it is, how it works, what it's built with, its
// parts, how to run it and who has worked on it. The facts come from the project's own
// files and git history; the plain-English description is the picked AI's (Settings), on request.
// The KT tab, also in the side menu, is the knowledge transfer: what the project is, how to get
// it running and its major functions, written with one request to the AI.

type Props = {
  tab: "overview" | "kt";
  onTab: (tab: "overview" | "kt") => void;
  summary: SummaryData;
  // The project and branch, naming the explanations that run in the background: they keep
  // going when the page is left, and show when it's opened again.
  scope: string;
  ai: AiStatus | null;
  // fresh: write it again.
  explain: (fresh?: boolean) => Promise<ProjectExplanation>;
  // The short KT: saved if written, written on request, and the address of its pictures.
  loadGuide: () => Promise<{ guide: KtGuide | null }>;
  writeGuide: (fresh?: boolean) => Promise<KtGuide>;
  imageUrl: (path: string) => string;
  // The detailed KT: every file with its connections, and the AI note on one file.
  loadDetail: (worktree?: boolean) => Promise<KtDetail>;
  writeDetail: (worktree: boolean, fresh?: boolean) => Promise<KtDetail>;
  explainFile: (path: string, fresh?: boolean, worktree?: boolean) => Promise<FileExplanation>;
  onSignedIn: () => void;
  onOpenMap: () => void;
};

export default function Summary(props: Props) {
  const { tab, onTab } = props;
  useJobs();
  // Shared by both tabs, so a description written on one shows on the other: the newest
  // rewrite, else one asked for here, else the one saved with the summary.
  const saved = props.summary.explanation?.overview?.trim() ? props.summary.explanation : null;
  const explanation = result<ProjectExplanation>(`project-fresh:${props.scope}`) ?? result<ProjectExplanation>(`project:${props.scope}`) ?? saved;
  return (
    <div className="summary-page">
      <div className="segmented summary-page__tabs" role="tablist" aria-label="Project">
        <button role="tab" aria-selected={tab === "overview"} className={tab === "overview" ? "is-on" : ""} onClick={() => onTab("overview")}>
          Overview
        </button>
        <button role="tab" aria-selected={tab === "kt"} className={tab === "kt" ? "is-on" : ""} onClick={() => onTab("kt")}>
          KT
        </button>
      </div>
      {tab === "overview" ? (
        <Overview {...props} explanation={explanation} onOpenKt={() => onTab("kt")} />
      ) : (
        <Kt {...props} />
      )}
    </div>
  );
}

type Shared = Props & {
  explanation: ProjectExplanation | null;
};

function Overview({ summary, scope, ai, explain, onSignedIn, onOpenMap, explanation, onOpenKt }: Shared & { onOpenKt: () => void }) {
  const describing = job(`project:${scope}`);
  const state = describing?.state === "working" ? "working" : describing?.state === "failed" ? describing.error : "idle";
  const history = summary.history;
  const languageFiles = summary.languages.reduce((sum, l) => sum + l.files, 0);
  const names = new Map(summary.parts.map((part) => [part.id, part.name]));
  const partWhat = new Map((explanation?.parts ?? []).map((part) => [part.name, part.what]));

  const run = () => {
    clear(`project:${scope}`);
    // An answer with no overview would leave the box empty: treated as a failure, so it can be asked again.
    start(`project:${scope}`, () =>
      explain().then((answer) => {
        if (!answer.overview?.trim()) throw new Error("The AI's answer left out the description. Try again, or pick another model in Settings.");
        return answer;
      }),
    ).catch(() => {});
  };

  return (
    <div className="summary">
      <section className="card summary__hero">
        <h2 className="summary__name">{summary.name}</h2>
        {summary.description && <p className="summary__description">{summary.description}</p>}
        {languageFiles > 0 && (
          <div className="summary__languages">
            <div className="summary__language-bar">
              {summary.languages.map((l) => (
                <span key={l.name} style={{ flex: l.files, background: languageColor(l.name) }} title={`${l.name}: ${l.files} files`} />
              ))}
            </div>
            <ul>
              {summary.languages.map((l) => (
                <li key={l.name}>
                  <i style={{ background: languageColor(l.name) }} />
                  {l.name} {Math.round((l.files / languageFiles) * 100)}%
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="summary__about">
          {explanation ? (
            <>
              <span className="summary__ai-label">About this project, in plain English</span>
              <p className="summary__overview">{explanation.overview}</p>
              {explanation.state && <p className="summary__state">{explanation.state}</p>}
              <button className="summary__link" onClick={onOpenKt}>
                The KT: setup, run commands and how to use it ›
              </button>
            </>
          ) : summary.readme?.intro ? (
            <>
              <span className="summary__ai-label summary__ai-label--plain">From the readme</span>
              <p className="summary__overview">{summary.readme.intro}</p>
            </>
          ) : (
            <p className="summary__muted">
              This project has no readme that says what it is
              {summary.revision === "(not committed yet)" ? ", and nothing is committed yet: this is read from its folder." : "."}
            </p>
          )}
          {!explanation && ai && (!ai.available || ai.signed_in === false) && <ClaudeSetup ai={ai} onRefresh={onSignedIn} />}
          {!explanation && ai?.available && ai.signed_in !== false && (
            <div className="summary__ask">
              <button onClick={run} disabled={state === "working"}>
                {state === "working" ? `${ai.name} is reading the project…` : `Describe it with ${ai.name}`}
              </button>
              <span>
                {state !== "idle" && state !== "working"
                  ? state
                  : "A plain-English overview, how the parts work together, and what each part is for."}
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="card summary__stats" aria-label="Numbers">
        <Stat label="Files" value={summary.files.toLocaleString()} />
        <Stat label="Size" value={bytes(summary.bytes)} />
        <Stat label="Commits" value={history.commits.toLocaleString()} />
        <Stat label="People" value={String(history.people.length)} />
        <Stat label="Branches" value={String(history.branches)} />
        <Stat label="Started" value={history.first ? ago(history.first) : "—"} />
        <div className="summary__activity">
          <span className="summary__stat-label">Commits per week, last 12 weeks</span>
          <div className="summary__weeks" role="img" aria-label={`Commits per week: ${history.weeks.join(", ")}`}>
            {history.weeks.map((count, i) => (
              <span
                key={i}
                style={{ height: `${(count / Math.max(1, ...history.weeks)) * 100}%` }}
                title={`${count} commit${count === 1 ? "" : "s"}, ${12 - i} week${12 - i === 1 ? "" : "s"} ago`}
              />
            ))}
          </div>
          <span className="summary__muted">Last change {history.last ? ago(history.last) : "never"}</span>
        </div>
      </section>

      <section className="card summary__how">
        <h3>How it works</h3>
        {explanation?.how_it_works.length ? (
          <ol className="summary__steps">
            {explanation.how_it_works.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        ) : summary.links.length > 0 ? (
          <>
            <p className="summary__muted">From the imports in the code:</p>
            <ul className="summary__links">
              {summary.links.slice(0, 8).map((link) => (
                <li key={`${link.source}>${link.target}`}>
                  <strong>{names.get(link.source)}</strong> uses <strong>{names.get(link.target)}</strong>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="summary__muted">Looma found no code links between the parts.</p>
        )}
        {explanation?.flows?.map((flow) => (
          <div key={flow.name} className="summary__flow">
            <h4>{flow.name}</h4>
            <ol className="summary__steps">
              {flow.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        ))}
        {explanation?.start_here?.length ? (
          <>
            <h4>Read these first</h4>
            <ul className="summary__files summary__start">
              {explanation.start_here.map((file) => (
                <li key={file.path}>
                  <code>{file.path}</code>
                  <span>{file.why}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {summary.entry_points.length > 0 && (
          <>
            <h4>Where it starts</h4>
            <ul className="summary__files">
              {summary.entry_points.map((path) => (
                <li key={path}>
                  <code>{path}</code>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card summary__parts">
        <header>
          <h3>Parts</h3>
          <button className="summary__link" onClick={onOpenMap}>
            Map ›
          </button>
        </header>
        <ul>
          {summary.parts.map((part) => (
            <li key={part.id}>
              <div>
                <strong>{part.name}</strong>
                <span>{partWhat.get(part.name) ?? part.role ?? (part.languages[0] ? `Mostly ${part.languages[0].name}` : "Files")}</span>
              </div>
              <em>
                {part.files} file{part.files === 1 ? "" : "s"}
              </em>
            </li>
          ))}
        </ul>
      </section>

      <section className="card summary__tech">
        <h3>Built with</h3>
        {summary.tech.length === 0 ? (
          <p className="summary__muted">No well-known tools found in its package files.</p>
        ) : (
          <ul>
            {summary.tech.map((tech) => (
              <li key={tech.name}>
                <code>{tech.name}</code>
                <span>{tech.what}</span>
              </li>
            ))}
          </ul>
        )}
        {summary.other_dependencies > 0 && (
          <p className="summary__muted">
            And {summary.other_dependencies} other package{summary.other_dependencies === 1 ? "" : "s"}.
          </p>
        )}
        {summary.run.length > 0 && (
          <>
            <h4>Commands</h4>
            <ul className="summary__commands">
              {summary.run.map((command) => (
                <li key={`${command.where}:${command.name}`} title={command.where}>
                  <code>{command.name}</code>
                  <span>{command.command}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {history.people.length > 0 && (
          <>
            <h4>People</h4>
            <ul className="summary__people">
              {history.people.map((person) => (
                <li key={person.name}>
                  <span className="summary__avatar">{person.name.slice(0, 1).toUpperCase()}</span>
                  {person.name}
                  <em>{person.commits}</em>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

// The KT tab offers two: the brief KT, a short guide written with one request to the AI,
// and the detailed KT, a table of every file with what it does, uses and is used by.
type KtKind = "brief" | "detailed";
const KT_KINDS: { id: KtKind; title: string; what: string }[] = [
  { id: "brief", title: "Brief KT", what: "A short guide: what it is, how to set it up and run it, and its major functions." },
  { id: "detailed", title: "Detailed KT", what: "Every file in a table: what it does, what it uses and what uses it." },
];

function Kt(props: Props) {
  const [kind, setKind] = useState<KtKind>(() => {
    try {
      return localStorage.getItem("looma.kt-kind") === "detailed" ? "detailed" : "brief";
    } catch {
      return "brief";
    }
  });
  const pick = (next: KtKind) => {
    setKind(next);
    try {
      localStorage.setItem("looma.kt-kind", next);
    } catch {
      // Not kept; the brief KT shows next time.
    }
  };
  return (
    <div className="kt-choice">
      <div className="kt-choice__options" role="tablist" aria-label="Kind of KT">
        {KT_KINDS.map((option) => (
          <button
            key={option.id}
            role="tab"
            aria-selected={kind === option.id}
            className={`card kt-choice__option${kind === option.id ? " is-on" : ""}`}
            onClick={() => pick(option.id)}
          >
            <strong>{option.title}</strong>
            <span>{option.what}</span>
          </button>
        ))}
      </div>
      {kind === "brief" ? (
        <BriefKt {...props} />
      ) : (
        <DetailedKt summary={props.summary} scope={props.scope} ai={props.ai} loadGuide={props.loadGuide}
          imageUrl={props.imageUrl} loadDetail={props.loadDetail} writeDetail={props.writeDetail}
          explainFile={props.explainFile} onSignedIn={props.onSignedIn} />
      )}
    </div>
  );
}

// The knowledge transfer: one short page on what the project is, what it needs, how to set
// it up and run it, and how to use it. One request to the AI, so it's done in about a minute,
// and saved until the project's readme, setup files or commands change.
function BriefKt({ summary, scope, ai, loadGuide, writeGuide, imageUrl, onSignedIn }: Props) {
  const [saved, setSaved] = useState<KtGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const key = `kt-guide:${scope}`;
  const run = job<KtGuide>(key);
  const guide = result<KtGuide>(key) ?? saved;
  const working = run?.state === "working";
  const ready = ai?.available && ai.signed_in !== false;

  useEffect(() => {
    let stale = false;
    setLoading(true);
    setSaved(null);
    loadGuide().then(
      (found) => !stale && setSaved(found.guide),
      () => {},
    ).finally(() => !stale && setLoading(false));
    return () => {
      stale = true;
    };
    // Read again for each project and branch; loadGuide changes on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const write = (fresh = false) => {
    clear(key);
    const began = Date.now();
    start(key, () => writeGuide(fresh), true)
      .then((written) => {
        remember((Date.now() - began) / 1000);
        setSaved(written);
      })
      .catch(() => {});
  };
  const problem = run?.state === "failed" ? run.error : null;

  if (loading && !guide) return <Loading label="Reading the KT…" shape="doc" />;
  if (!guide) {
    return (
      <section className="card kt kt--empty">
        <h3>Knowledge transfer for {summary.name}</h3>
        <p>A short guide for someone new: what it is, how to set it up, run and use it, and its major functions. It takes under a minute to write.</p>
        {ai && !ready && <ClaudeSetup ai={ai} onRefresh={onSignedIn} />}
        {ready && !working && (
          <div>
            <button className="kt__button" onClick={() => write()} data-tour="kt-action">
              Write the KT with {ai!.name}
            </button>
          </div>
        )}
        {working && <Writing jobKey={key} ai={ai!.name} />}
        {problem && <p className="kt__error" role="alert">{problem}</p>}
        {summary.run.length > 0 && (
          <div>
            <h4>Commands found in the project</h4>
            <Commands items={summary.run.map((r) => ({ what: `${r.name} (${r.where})`, command: r.command }))} />
          </div>
        )}
      </section>
    );
  }
  const has = (items: unknown[]) => items.length > 0;
  return (
    <div className="kt kt--guide">
      <header className="card kt__head">
        <div>
          <h3>{summary.name}</h3>
          <p><Inline text={guide.overview} /></p>
        </div>
        <div className="kt__actions">
          <button className="kt__button" onClick={() => downloadGuide(summary, guide, imageUrl)} data-tour="kt-action">Download PDF</button>
          {ready && (
            <button className="kt__button kt__button--quiet" onClick={() => write(true)} disabled={working}>
              {working ? "Writing…" : "Write again"}
            </button>
          )}
        </div>
      </header>
      {working && <Writing jobKey={key} ai={ai!.name} />}
      {problem && <p className="kt__error" role="alert">{problem}</p>}
      <div className="kt__columns">
        <div className="kt__column">
          {has(guide.needs) && (
            <section className="card kt__card">
              <h4>What you need</h4>
              <ul className="kt__needs">
                {guide.needs.map((need) => (
                  <li key={need.name}>
                    <strong><Inline text={need.name} /></strong>
                    {need.why && <span><Inline text={need.why} /></span>}
                    {need.check && <Command command={need.check} />}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {has(guide.setup) && (
            <section className="card kt__card">
              <h4>Set it up</h4>
              <ol className="kt__setup">
                {guide.setup.map((item) => (
                  <li key={item.step}>
                    <strong><Inline text={item.step} /></strong>
                    {item.detail && <span className="kt__detail"><Inline text={item.detail} /></span>}
                    {item.command && <Command command={item.command} />}
                  </li>
                ))}
              </ol>
            </section>
          )}
          {has(guide.run) && (
            <section className="card kt__card">
              <h4>Run it</h4>
              <Commands items={guide.run} />
            </section>
          )}
        </div>
        <div className="kt__column">
          {has(guide.how_to_use) && (
            <section className="card kt__card">
              <h4>How to use it</h4>
              <ol className="kt__setup">{guide.how_to_use.map((step) => <li key={step}><Inline text={step} /></li>)}</ol>
            </section>
          )}
          {has(guide.settings) && (
            <section className="card kt__card">
              <h4>Settings to fill in</h4>
              <dl className="kt__pairs">
                {guide.settings.map((item) => (
                  <div key={item.name}><dt><code>{item.name}</code></dt><dd><Inline text={item.what} /></dd></div>
                ))}
              </dl>
            </section>
          )}
          {has(guide.start_here) && (
            <section className="card kt__card">
              <h4>Read these first</h4>
              <dl className="kt__pairs">
                {guide.start_here.map((item) => (
                  <div key={item.path}><dt><code>{item.path}</code></dt><dd><Inline text={item.why} /></dd></div>
                ))}
              </dl>
            </section>
          )}
          {guide.images.map((image) => (
            <figure key={image.path} className="card kt__image">
              <img src={imageUrl(image.path)} alt={image.caption} loading="lazy" />
              <figcaption>{image.caption}</figcaption>
            </figure>
          ))}
        </div>
      </div>
      {has(guide.functions) && (
        <section className="card kt__card">
          <h4>Major functions</h4>
          <dl className="kt__functions-list">
            {guide.functions.map((item) => (
              <div key={`${item.path}:${item.name}`}>
                <dt><code>{item.name}</code><span>{item.path}</span></dt>
                <dd>
                  {item.signature && <code className="kt__signature">{item.signature}</code>}
                  <Inline text={item.what} />
                  {item.use && <em><Inline text={item.use} /></em>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}

// How long the last KT took to write here, to pace the progress bar.
const KT_SECONDS = "looma:kt-seconds";
const DEFAULT_KT_SECONDS = 40;

function expected(): number {
  try {
    const saved = Number(localStorage.getItem(KT_SECONDS));
    return saved > 5 && saved < 600 ? saved : DEFAULT_KT_SECONDS;
  } catch {
    return DEFAULT_KT_SECONDS;
  }
}

function remember(seconds: number) {
  try {
    localStorage.setItem(KT_SECONDS, String(Math.round(seconds)));
  } catch {
    /* storage unavailable: the default pace is used */
  }
}

// The KT is one request to the AI, which says nothing until it's done, so the bar is paced
// by how long the last one took: it reaches 90% then, and creeps on until the answer comes.
function Writing({ jobKey, ai }: { jobKey: string; ai: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, (now - (since(jobKey) ?? now)) / 1000);
  const pace = expected();
  const share = seconds < pace ? (seconds / pace) * 90 : 90 + 8 * (1 - Math.exp(-(seconds - pace) / pace));
  const at = (from: number, to: number): "done" | "now" | "todo" => (share >= to ? "done" : share >= from ? "now" : "todo");
  return (
    <Progress
      steps={[
        { label: "Reading the project's files", state: at(0, 6) },
        { label: `${ai} is writing the KT`, state: at(6, 90) },
        { label: "Putting the guide together", state: at(90, 101) },
      ]}
      share={share}
      meta={`${Math.round(seconds)} s of about ${Math.round(pace)} s`}
      note="You can leave this page; it keeps going."
    />
  );
}

// The AI marks names and commands with `backticks`; shown as code, not as backticks.
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, i) =>
        part.length > 2 && part.startsWith("`") && part.endsWith("`") ? <code key={i}>{part.slice(1, -1)}</code> : part,
      )}
    </>
  );
}

function Commands({ items }: { items: { what: string; command: string }[] }) {
  return (
    <ul className="kt__commands">
      {items.map((item) => (
        <li key={item.command}>
          <span><Inline text={item.what} /></span>
          <Command command={item.command} />
        </li>
      ))}
    </ul>
  );
}

function Command({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard.writeText(command).then(() => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }, () => {});
  return (
    <span className="kt__command">
      <code>{command}</code>
      <button onClick={copy} aria-label={`Copy ${command}`}>{copied ? "Copied" : "Copy"}</button>
    </span>
  );
}

export type FileNoteProps = {
  path: string;
  note: FileExplanation | null;
  ai: AiStatus | null;
  onSignedIn: () => void;
  explain: () => void;
  busy: boolean;
  problem: string | null;
};

// What one file is for, from the knowledge transfer, shown where the file itself is shown
// (Changes, a prompt's changes), with a button to ask for it when it isn't written yet.
export function FileNote({ path, note, ai, onSignedIn, explain, busy, problem }: FileNoteProps) {
  const [open, setOpen] = useState(false);
  const ready = ai?.available && ai.signed_in !== false;
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (!note) {
    if (!ai) return null;
    return (
      <section className="filenote filenote--empty">
        <span className="filenote__label">About {name}</span>
        {ready ? (
          <div className="filenote__ask">
            <button onClick={explain} disabled={busy}>
              {busy ? `${ai.name} is reading the file…` : `What is this file for? Ask ${ai.name}`}
            </button>
            <span>{problem ?? "Its purpose, what each function does, and what it connects to. Saved for next time."}</span>
          </div>
        ) : (
          <ClaudeSetup ai={ai} onRefresh={onSignedIn} />
        )}
      </section>
    );
  }
  const more = note.functions.length > 0 || note.connects || note.notes.length > 0;
  return (
    <section className="filenote">
      <span className="filenote__label">About {name}</span>
      <p className="filenote__purpose">{note.purpose}</p>
      {more && (
        <button className="filenote__more" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "Less" : note.functions.length > 1 ? `Each of its ${note.functions.length} functions, and what it connects to` : note.functions.length === 1 ? "Its function, and what it connects to" : "What it connects to"}
        </button>
      )}
      {open && (
        <div className="kt__note">
          {note.functions.length > 0 && (
            <dl className="kt__functions">
              {note.functions.map((fn) => (
                <div key={fn.name}>
                  <dt>
                    <code>{fn.name}</code>
                  </dt>
                  <dd>{fn.what}</dd>
                </div>
              ))}
            </dl>
          )}
          {note.connects && (
            <p>
              <strong>Connects to:</strong> {note.connects}
            </p>
          )}
          {note.notes.length > 0 && (
            <ul className="kt__watch">
              {note.notes.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary__stat">
      <span className="summary__stat-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function ago(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  if (days < 60) return `${days} days ago`;
  if (days < 730) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}
