import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "../../api/client";
import type { GitAction, GitBranch, GitFile, GitRequest, GitResult, GitStatus } from "../../api/types";
import Loading from "../Loading/Loading";
import "../AddProject/AddProject.css";
import "./Git.css";

// The Git screen, in everyday words: where you are and what to do next, then the two steps
// (save your work, share it), with branches and set-aside changes beside them. Every step but
// ticking files and going to a branch asks first, says what it will do in plain words, and
// keeps the exact git commands one click away. The last step that moved a branch can be undone.

type Props = {
  repoId: number;
  // Changes when git changes underneath the page, to read it again.
  version: string;
  suggestMessage: () => Promise<string>;
};

// A step waiting for a yes, with what its preview said. Toggles change the request (deleting
// anyway, or online too) and preview it again.
type Pending = {
  action: GitAction;
  body: GitRequest;
  title: string;
  go: string;
  danger?: boolean;
  preview: GitResult | null;
  error: string | null;
  toggles?: { key: "force" | "remote"; label: string }[];
};

type Outcome = { ok: boolean; message: string; commands: string[]; conflicts: string[]; url: string | null };
type Ask = (step: Omit<Pending, "preview" | "error">) => void;
type Execute = (action: GitAction, body: GitRequest) => Promise<GitResult | null>;
type StepProps = { status: GitStatus; busy: boolean; ask: Ask };
type RunProps = StepProps & { execute: Execute };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
// Where the project is kept online, as the person knows it.
const hostOf = (status: GitStatus) =>
  status.remote_url && /github\.com/i.test(status.remote_url) ? "GitHub" : (status.remote ?? "the remote");
// GitHub's owner/name, or the address as it is.
const shortRemote = (url: string) =>
  url.replace(/^.*github\.com[:/]/i, "").replace(/\.git$/, "").replace(/^[a-z]+:\/\//i, "");
const askPush = (ask: Ask, status: GitStatus) =>
  ask({ action: "push", body: {}, title: `Send ${status.branch} to ${hostOf(status)}`, go: "Send" });
const askPull = (ask: Ask, status: GitStatus, how: "merge" | "rebase" = "merge") =>
  ask({ action: "pull", body: { how }, title: `Get the latest from ${hostOf(status)}`, go: "Get latest" });
const focusMessage = () => {
  const box = document.getElementById("git-message");
  box?.scrollIntoView({ behavior: "smooth", block: "center" });
  box?.focus({ preventScroll: true });
};

export default function Git({ repoId, version, suggestMessage }: Props) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const reload = useCallback(
    () =>
      api.git(repoId).then(
        (found) => {
          setStatus(found);
          setLoadError(null);
        },
        (e: ApiError) => setLoadError(e.message),
      ),
    [repoId],
  );
  useEffect(() => {
    reload();
  }, [reload, version]);

  const execute: Execute = async (action, body) => {
    setBusy(true);
    try {
      const result = await api.gitAction(repoId, action, body);
      setOutcome({ ok: result.done || result.conflicts.length > 0, message: result.message, commands: result.commands, conflicts: result.conflicts, url: result.url });
      setPending(null);
      return result;
    } catch (e) {
      const message = (e as ApiError).message;
      if (pending) setPending((current) => current && { ...current, error: message });
      else setOutcome({ ok: false, message, commands: [], conflicts: [], url: null });
      return null;
    } finally {
      setBusy(false);
      reload();
    }
  };

  // Says what the step will do, and waits for a yes.
  const ask: Ask = async (step) => {
    setPending({ ...step, preview: null, error: null });
    try {
      const preview = await api.gitAction(repoId, step.action, step.body, true);
      setPending((current) => (current && current.action === step.action ? { ...current, preview } : current));
    } catch (e) {
      setPending((current) => current && { ...current, error: (e as ApiError).message });
    }
  };

  const toggle = async (key: "force" | "remote") => {
    if (!pending) return;
    const body = { ...pending.body, [key]: !pending.body[key] };
    setPending({ ...pending, body, preview: null, error: null });
    try {
      const preview = await api.gitAction(repoId, pending.action, body, true);
      setPending((current) => current && { ...current, preview });
    } catch (e) {
      setPending((current) => current && { ...current, error: (e as ApiError).message });
    }
  };

  if (loadError && !status) return <p className="git-error card">{loadError}</p>;
  if (!status) return <Loading label="Reading your project…" />;

  return (
    <div className="git">
      <Where status={status} busy={busy} ask={ask} />
      {status.midway && <Midway status={status} busy={busy} ask={ask} execute={execute} />}
      {outcome && <OutcomeNote outcome={outcome} onClose={() => setOutcome(null)} />}
      <div className="git__columns">
        <div className="git__main">
          <Save status={status} busy={busy} ask={ask} execute={execute} suggestMessage={suggestMessage} />
          <Share status={status} busy={busy} ask={ask} />
        </div>
        <div className="git__side">
          <Branches status={status} busy={busy} ask={ask} execute={execute} />
          <Shelf status={status} busy={busy} ask={ask} />
        </div>
      </div>
      {pending && (
        <Confirm
          pending={pending}
          busy={busy}
          onToggle={toggle}
          onCancel={() => setPending(null)}
          onGo={() => execute(pending.action, pending.body)}
        />
      )}
    </div>
  );
}

// Where you are, how it compares with GitHub in a sentence, and the one next step worth taking.
function Where({ status, busy, ask }: StepProps) {
  const host = hostOf(status);
  const branch = status.branch ?? "no branch";
  const unsaved = status.files.filter((file) => !file.conflict).length;
  const parts: string[] = [];
  if (unsaved > 0) parts.push(`${plural(unsaved, "change")} not saved yet`);
  if (status.ahead > 0) parts.push(`${plural(status.ahead, "saved change")} not sent to ${host}`);
  if (status.behind > 0) parts.push(`${host} has ${plural(status.behind, "newer change")} you don't have`);
  if (parts.length === 0 && status.remote && !status.upstream && status.head) parts.push(`this branch isn't on ${host} yet`);
  const ok = parts.length === 0;
  const text = ok
    ? status.remote
      ? `Everything is saved and matches ${host}.`
      : "Everything is saved. This project isn't connected to GitHub."
    : `${parts[0][0].toUpperCase()}${parts.join(", ").slice(1)}.`;

  // The first thing that needs doing: save, then catch up, then send.
  let next: { label: string; run: () => void } | null = null;
  if (unsaved > 0) next = { label: "Save your changes", run: focusMessage };
  else if (status.behind > 0) next = { label: "Get the latest", run: () => askPull(ask, status) };
  else if (status.remote && status.head && status.branch && (status.ahead > 0 || !status.upstream))
    next = { label: `Send to ${host}`, run: () => askPush(ask, status) };

  return (
    <section className="card git-head">
      <div className="git-head__where">
        <span className="git-head__label">You're working on</span>
        <code className="git-head__branch">{branch}</code>
        <span className="git-head__remote">
          {status.remote && status.remote_url ? (
            <>
              Online copy:{" "}
              {status.branch_url ? (
                <a href={status.branch_url} target="_blank" rel="noreferrer" title={`Open this branch on ${host}`}>
                  {shortRemote(status.remote_url)} ›
                </a>
              ) : (
                shortRemote(status.remote_url)
              )}
            </>
          ) : (
            "Not connected to GitHub or any other online copy."
          )}
        </span>
        <p className={`git-head__status${ok ? " is-ok" : ""}`}>
          <i aria-hidden="true" />
          {text}
        </p>
      </div>
      <div className="git-head__actions">
        {status.last && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || !status.last.undoable}
            title={status.last.why_not ?? `Undo: ${status.last.summary}`}
            onClick={() => ask({ action: "undo", body: {}, title: `Undo: ${status.last!.summary}`, go: "Undo" })}
          >
            ↶ Undo last step
          </Button>
        )}
        {next && (
          <Button variant="gradient" size="sm" disabled={busy} onClick={next.run}>
            {next.label}
          </Button>
        )}
      </div>
    </section>
  );
}

// A merge or rebase that stopped because the same lines changed in two places.
function Midway({ status, busy, ask, execute }: RunProps) {
  const kind = status.midway!;
  return (
    <section className="card git-midway" role="status">
      <h2>Combining stopped: some files were changed in two places</h2>
      {status.conflicts.length > 0 ? (
        <>
          <p>
            Looma can't pick which version to keep. Open each file below in your editor. Git marks the two versions with{" "}
            <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code> and <code>&gt;&gt;&gt;&gt;&gt;&gt;&gt;</code>. Keep what you want, delete
            those marker lines, save the file, then press “I fixed it”.
          </p>
          <ul className="git-midway__files">
            {status.conflicts.map((path) => (
              <li key={path}>
                <code>{path}</code>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => execute("stage", { paths: [path] })}>
                  I fixed it
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>Every file is fixed. Press Finish to complete it.</p>
      )}
      <div className="git-midway__actions">
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => ask({ action: "abort", body: {}, title: `Stop the ${kind} and go back`, go: "Stop and go back", danger: true })}>
          Stop and go back
        </Button>
        <Button
          variant="gradient"
          size="sm"
          disabled={busy || status.conflicts.length > 0}
          onClick={() => ask({ action: "continue", body: {}, title: "Finish combining", go: "Finish" })}
        >
          Finish
        </Button>
      </div>
    </section>
  );
}

// Step 1: pick the files, say what you did, save.
function Save({ status, busy, ask, execute, suggestMessage }: RunProps & { suggestMessage: () => Promise<string> }) {
  const [message, setMessage] = useState("");
  const [amend, setAmend] = useState(false);
  const [writing, setWriting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const files = status.files.filter((file) => !file.conflict);
  const picked = files.filter((file) => file.staged);
  const canAmend = !!status.head && !status.pushed;
  const showForm = files.length > 0 || amend;

  const suggest = async () => {
    setWriting(true);
    setProblem(null);
    try {
      setMessage(await suggestMessage());
    } catch (e) {
      const error = e as ApiError;
      setProblem(error.status === 424 ? "The AI isn't signed in. Sign in under Settings → AI, then try again." : error.message);
    } finally {
      setWriting(false);
    }
  };

  return (
    <section className="card git-card git-card--grow">
      <header className="git-card__head">
        <span className="git-step" aria-hidden="true">1</span>
        <h2>Save your work</h2>
        <span className="git-card__count">{files.length === 0 ? "Nothing to save" : `${picked.length} of ${files.length} picked`}</span>
      </header>
      <p className="git-card__intro">
        {files.length > 0
          ? "Pick the files to include, then say what you did. A save is a step you can always come back to."
          : "Your files match your last save. When you change something, it shows up here."}
      </p>
      {files.length > 0 && (
        <>
          <div className="git-card__tools">
            <button type="button" className="git-link" disabled={busy || picked.length === files.length} onClick={() => execute("stage", {})}>
              Select all
            </button>
            <button type="button" className="git-link" disabled={busy || picked.length === 0} onClick={() => execute("unstage", {})}>
              Select none
            </button>
          </div>
          <ul className="git-files">
            {files.map((file) => (
              <FileRow key={file.path} file={file} busy={busy} execute={execute} />
            ))}
          </ul>
        </>
      )}
      {showForm && (
        <label className="git-commit">
          <span className="git-commit__label">{amend ? "New message for your last save" : "What did you change?"}</span>
          <textarea
            id="git-message"
            rows={3}
            value={message}
            placeholder={amend ? "What your last save should say" : "For example: Fix the login button"}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>
      )}
      {problem && <p className="modal__error">{problem}</p>}
      {showForm && (
        <div className="git-commit__actions">
          {!amend && (
            <Button variant="ghost" size="sm" disabled={busy || writing || picked.length === 0} onClick={suggest} title="The AI you picked in Settings writes it from your changes">
              {writing ? "Writing…" : "✦ Write it for me"}
            </Button>
          )}
          <Button
            variant="gradient"
            size="sm"
            disabled={busy || !message.trim() || (!amend && picked.length === 0)}
            onClick={() =>
              ask(
                amend
                  ? { action: "amend", body: { message }, title: "Change the message of your last save", go: "Change message" }
                  : { action: "commit", body: { message }, title: `Save ${plural(picked.length, "file")}`, go: "Save" },
              )
            }
          >
            {amend ? "Change message" : "Save changes"}
          </Button>
        </div>
      )}
      <details className="git-more">
        <summary>More</summary>
        <label className="git-check" title={canAmend ? undefined : status.head ? "That save is already online, so it can't be changed." : "There's no save yet."}>
          <input type="checkbox" checked={amend} disabled={!canAmend} onChange={(event) => setAmend(event.target.checked)} />
          Fix the message of my last save instead
        </label>
      </details>
    </section>
  );
}

const WORDS: Record<string, string> = { new: "new", added: "new", modified: "edited", deleted: "deleted", renamed: "renamed", copied: "copied" };

function FileRow({ file, busy, execute }: { file: GitFile; busy: boolean; execute: Execute }) {
  // Picked in part: some edits came after it was picked. Ticking picks the rest.
  const all = !!file.staged && !file.unstaged;
  const some = !!file.staged && !!file.unstaged;
  const how = WORDS[file.staged ?? file.unstaged ?? "modified"];
  return (
    <li className="git-files__row">
      <label>
        <input
          type="checkbox"
          checked={all}
          ref={(input) => {
            if (input) input.indeterminate = some;
          }}
          disabled={busy}
          onChange={() => execute(all ? "unstage" : "stage", { paths: [file.path] })}
        />
        <code className="git-files__path">{file.old_path ? `${file.old_path} → ${file.path}` : file.path}</code>
        <span className={`git-files__how git-files__how--${how}`}>{some ? "partly picked" : how}</span>
      </label>
    </li>
  );
}

// Step 2: send your saves online, get others', and keep up with the main branch.
function Share({ status, busy, ask }: StepProps) {
  const host = hostOf(status);
  const branch = status.branch;
  const [how, setHow] = useState<"merge" | "rebase">("merge");
  const [base, setBase] = useState(status.base ?? "");
  const bases = [status.base, ...status.branches.map((b) => b.name)].filter(
    (name, i, all): name is string => !!name && all.indexOf(name) === i && name !== branch,
  );
  const picked = bases.includes(base) ? base : (bases[0] ?? "");
  const online = !!status.remote;
  const canSend = online && !!status.head && !!branch && (!status.upstream || status.ahead > 0);

  return (
    <section className="card git-card">
      <header className="git-card__head">
        <span className="git-step" aria-hidden="true">2</span>
        <h2>Share with others</h2>
        {online && <span className="git-card__count">{host}</span>}
      </header>
      {online ? (
        <ul className="git-share">
          <li className="git-share__row">
            <span className="git-share__what">
              <strong>Send your saved work to {host}</strong>
              <small>
                {status.ahead > 0
                  ? `${plural(status.ahead, "saved change")} waiting to be sent.`
                  : !status.upstream
                    ? `This branch isn't on ${host} yet.`
                    : "Nothing waiting to be sent."}
              </small>
            </span>
            <Button variant={canSend ? "gradient" : "outline"} size="sm" disabled={busy || !canSend} title="git push" onClick={() => askPush(ask, status)}>
              Send{status.ahead > 0 ? ` (${status.ahead})` : ""}
            </Button>
          </li>
          <li className="git-share__row">
            <span className="git-share__what">
              <strong>Get what others added</strong>
              <small>
                {status.behind > 0
                  ? `${host} has ${plural(status.behind, "newer change")} for you.`
                  : status.upstream
                    ? `You have everything that's on ${host}.`
                    : "Send this branch first."}
              </small>
            </span>
            <Button variant={status.behind > 0 ? "gradient" : "outline"} size="sm" disabled={busy || !status.upstream} title="git pull" onClick={() => askPull(ask, status, how)}>
              Get latest{status.behind > 0 ? ` (${status.behind})` : ""}
            </Button>
          </li>
        </ul>
      ) : (
        <p className="git-card__intro">This project isn't connected to GitHub, so there's nothing to send or get. You can still bring in another branch's latest work below.</p>
      )}
      {bases.length > 0 && branch && (
        <div className="git-share__row git-share__row--base">
          <span className="git-share__what">
            <strong>
              Bring the latest from{" "}
              <select aria-label="Branch to bring in" value={picked} onChange={(event) => setBase(event.target.value)}>
                {bases.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>{" "}
              into this branch
            </strong>
            <small>Keeps your work from drifting away from {picked}, so it combines cleanly later.</small>
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            title="git merge"
            onClick={() => ask({ action: "update", body: { base: picked, how }, title: `Bring the latest from ${picked} into ${branch}`, go: "Bring in" })}
          >
            Bring in
          </Button>
        </div>
      )}
      <details className="git-more">
        <summary>How should changes be combined?</summary>
        <label className="git-check">
          <input type="radio" name="git-how" checked={how === "merge"} onChange={() => setHow("merge")} />
          Join them together (the usual way, and the safest)
        </label>
        <label className="git-check">
          <input type="radio" name="git-how" checked={how === "rebase"} onChange={() => setHow("rebase")} />
          Replay my work on top of theirs (a tidier history)
        </label>
      </details>
    </section>
  );
}

// Branches: separate copies of the project to work on without touching the rest.
function Branches({ status, busy, ask, execute }: RunProps) {
  const [name, setName] = useState("");
  const [start, setStart] = useState<"current" | "base">("current");
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  const [showOnline, setShowOnline] = useState(false);
  const base = status.base;
  const host = hostOf(status);

  return (
    <section className="card git-card git-card--grow">
      <header className="git-card__head">
        <h2>Branches</h2>
        <span className="git-card__count">{status.branches.length}</span>
      </header>
      <p className="git-card__intro">A branch is a separate copy of your project, to try something without touching the rest.</p>
      <form
        className="git-new"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) ask({ action: "branch-create", body: { name: name.trim(), start }, title: `Start the branch ${name.trim()}`, go: "Start branch" });
        }}
      >
        <input value={name} placeholder="Name for a new branch" aria-label="Name for a new branch" onChange={(event) => setName(event.target.value)} />
        <select aria-label="Start the branch from" value={start} onChange={(event) => setStart(event.target.value as "current" | "base")}>
          <option value="current">copy of {status.branch ?? "here"}</option>
          {base && base !== status.branch && <option value="base">copy of {base}</option>}
        </select>
        <Button type="submit" size="sm" disabled={busy || !name.trim()}>
          Start branch
        </Button>
      </form>
      <ul className="git-branches">
        {status.branches.map((branch) =>
          renaming?.from === branch.name ? (
            <li key={branch.name} className="git-branches__row">
              <form
                className="git-rename"
                onSubmit={(event) => {
                  event.preventDefault();
                  ask({ action: "branch-rename", body: { name: branch.name, new_name: renaming.to.trim() }, title: `Rename ${branch.name}`, go: "Rename" });
                  setRenaming(null);
                }}
              >
                <input autoFocus value={renaming.to} aria-label={`New name for ${branch.name}`} onChange={(event) => setRenaming({ ...renaming, to: event.target.value })} />
                <Button type="submit" size="sm" disabled={busy || !renaming.to.trim() || renaming.to.trim() === branch.name}>
                  Rename
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setRenaming(null)}>
                  Cancel
                </Button>
              </form>
            </li>
          ) : (
            <BranchRow
              key={branch.name}
              branch={branch}
              base={base}
              busy={busy}
              onGo={() => execute("switch", { name: branch.name })}
              onRename={() => setRenaming({ from: branch.name, to: branch.name })}
              onDelete={() =>
                ask({
                  action: "branch-delete",
                  body: { name: branch.name, force: false, remote: false },
                  title: `Delete ${branch.name}`,
                  go: "Delete",
                  danger: true,
                  toggles: [
                    ...(branch.unmerged > 0
                      ? [{ key: "force" as const, label: `Delete anyway: its ${plural(branch.unmerged, "saved change")} that aren't in ${base} yet will be lost` }]
                      : []),
                    ...(branch.upstream && !branch.gone ? [{ key: "remote" as const, label: `Delete it on ${host} too, for everyone` }] : []),
                  ],
                })
              }
            />
          ),
        )}
      </ul>
      {status.remote_branches.length > 0 && (
        <div className="git-remote">
          <button type="button" className="git-link" onClick={() => setShowOnline(!showOnline)} aria-expanded={showOnline}>
            {showOnline ? "▾" : "▸"} {plural(status.remote_branches.length, "more branch", "more branches")} on {host}, not on this computer
          </button>
          {showOnline && (
            <ul className="git-branches">
              {status.remote_branches.map((remoteName) => (
                <li key={remoteName} className="git-branches__row">
                  <code className="git-branches__name">{remoteName}</code>
                  <span className="git-branches__actions">
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => execute("switch", { name: remoteName })}>
                      Get it
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function BranchRow({ branch, base, busy, onGo, onRename, onDelete }: {
  branch: GitBranch; base: string | null; busy: boolean; onGo: () => void; onRename: () => void; onDelete: () => void;
}) {
  return (
    <li className={`git-branches__row${branch.current ? " git-branches__row--current" : ""}`}>
      <code className="git-branches__name">{branch.name}</code>
      <span className="git-branches__tags">
        {branch.current && <span className="git-tag git-tag--on">you're here</span>}
        {branch.unmerged > 0 && base && <span className="git-tag" title={`Saved changes that aren't in ${base} yet`}>{plural(branch.unmerged, "change")} not in {base} yet</span>}
        {branch.gone && <span className="git-tag git-tag--gone" title="Its online copy was deleted">removed online</span>}
      </span>
      <span className="git-branches__actions">
        {!branch.current && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={onGo} title="Move onto this branch">
            Go there
          </Button>
        )}
        <Button variant="ghost" size="sm" disabled={busy} onClick={onRename}>
          Rename
        </Button>
        {!branch.current && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={onDelete}>
            Delete
          </Button>
        )}
      </span>
    </li>
  );
}

// Unfinished changes put on a shelf, to bring back later.
function Shelf({ status, busy, ask }: StepProps) {
  const [message, setMessage] = useState("");
  const changed = status.files.length > 0;
  return (
    <section className="card git-card">
      <header className="git-card__head">
        <h2>Set-aside changes</h2>
        <span className="git-card__count">{status.stashes.length}</span>
      </header>
      <p className="git-card__intro">Not ready to save? Put unfinished changes on a shelf, work on something else, and bring them back later.</p>
      <form
        className="git-new"
        onSubmit={(event) => {
          event.preventDefault();
          ask({ action: "stash", body: { message: message.trim() }, title: "Set your changes aside", go: "Set aside" });
          setMessage("");
        }}
      >
        <input value={message} placeholder="What you were doing (optional)" aria-label="What you were doing" onChange={(event) => setMessage(event.target.value)} />
        <Button type="submit" size="sm" disabled={busy || !changed} title={changed ? undefined : "You have no unsaved changes to set aside."}>
          Set aside
        </Button>
      </form>
      {status.stashes.length === 0 ? (
        <p className="git-card__muted">Nothing on the shelf.</p>
      ) : (
        <ul className="git-branches">
          {status.stashes.map((stash) => (
            <li key={stash.sha} className="git-branches__row">
              <span className="git-stash__what">
                <span className="git-stash__message">{stash.message}</span>
                <span className="git-card__muted">{ago(stash.at)}</span>
              </span>
              <span className="git-branches__actions">
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => ask({ action: "stash-pop", body: { sha: stash.sha }, title: "Bring your changes back", go: "Bring back" })}>
                  Bring back
                </Button>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => ask({ action: "stash-drop", body: { sha: stash.sha }, title: "Throw these changes away", go: "Throw away", danger: true })}>
                  Throw away
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// What a step did (or why git refused), with a link to see it and the commands it ran.
function OutcomeNote({ outcome, onClose }: { outcome: Outcome; onClose: () => void }) {
  return (
    <section className={`card git-outcome${outcome.ok ? "" : " git-outcome--bad"}`} role="status">
      <p>
        <span aria-hidden="true">{outcome.ok ? "✓ " : "⚠ "}</span>
        {outcome.message}
      </p>
      {outcome.url && (
        <a className="git-outcome__link" href={outcome.url} target="_blank" rel="noreferrer">
          Open on GitHub ›
        </a>
      )}
      {outcome.commands.length > 0 && <Commands commands={outcome.commands} label="Show the git command" />}
      <button type="button" className="git-outcome__close" aria-label="Close" onClick={onClose}>
        ×
      </button>
    </section>
  );
}

// The exact git commands, for anyone curious, out of the way for everyone else.
function Commands({ commands, label }: { commands: string[]; label: string }) {
  return (
    <details className="git-more">
      <summary>{label}</summary>
      <pre className="git-commands">{commands.map((command) => `$ ${command}`).join("\n")}</pre>
    </details>
  );
}

function Confirm({ pending, busy, onToggle, onCancel, onGo }: { pending: Pending; busy: boolean; onToggle: (key: "force" | "remote") => void; onCancel: () => void; onGo: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  const { preview } = pending;
  return (
    <div className="modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section className="modal__panel card" role="alertdialog" aria-labelledby="git-confirm-title">
        <h2 id="git-confirm-title">{pending.title}</h2>
        {preview ? <p className="modal__lead">{preview.summary}</p> : !pending.error && <p className="git-card__muted">One moment…</p>}
        {pending.toggles?.map((item) => (
          <label key={item.key} className="git-check">
            <input type="checkbox" checked={!!pending.body[item.key]} onChange={() => onToggle(item.key)} />
            {item.label}
          </label>
        ))}
        {preview?.notes.map((note) => (
          <p key={note} className="git-note">
            {note}
          </p>
        ))}
        {preview && <Commands commands={preview.commands} label="Show the git commands" />}
        {pending.error && <p className="modal__error">{pending.error}</p>}
        <div className="modal__actions">
          <Button variant="ghost" onClick={onCancel} autoFocus>
            Cancel
          </Button>
          <Button variant={pending.danger ? "danger" : "gradient"} onClick={onGo} disabled={busy || !preview}>
            {busy ? "Working…" : pending.go}
          </Button>
        </div>
      </section>
    </div>
  );
}

function ago(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}
