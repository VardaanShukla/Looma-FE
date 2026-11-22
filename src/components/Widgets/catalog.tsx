import { useState, type ReactNode } from "react";
import { api } from "../../api/client";
import type {
  AiStatus, BranchInfo, Comparison, Digest, DigestChange, Flow, FlowCommit, PlacedWidget, ProjectMap,
  RecordingHealth, Repo, WidgetStyle, WidgetType,
} from "../../api/types";
import Chrono from "../Chrono/Chrono";
import { branchNote, GaugeDial, SIZES } from "../Overview/Overview";
import type { View } from "../SideMenu/SideMenu";

// Every widget Home can show. Each reads what Home already loaded (HomeData), draws its own
// heading and body, and has options the person sets in the widget's settings; its size and
// place on the grid, style, accent and title are the same for every kind (see Grid).

export type HomeData = {
  repos: Repo[];
  picked: Repo | null;
  comparison: Comparison | null;
  branches: BranchInfo[];
  checkedOut: string | null;
  flow: Flow | null;
  map: ProjectMap | null;
  ai: AiStatus | null;
  // Today's AI changes in every project, and whether recording works; null while they load.
  digest: Digest | null;
  health: RecordingHealth | null;
  onHealth: (health: RecordingHealth) => void;
  error: string | null;
  username?: string;
  onHeadChange: (head: string) => void;
  onView: (view: View) => void;
  onOpenFile: (path: string) => void;
  onDigest: () => void;
  onOpenChange: (id: string) => void;
};

type Value = string | number | boolean;
export type OptionSpec = {
  key: string;
  label: string;
  kind: "toggle" | "choice" | "number" | "text";
  default: Value;
  choices?: { value: string; label: string }[];
  min?: number;
  max?: number;
};
type WidgetProps = { data: HomeData; widget: PlacedWidget; title: string; o: (key: string) => Value };
export type WidgetSpec = {
  type: WidgetType;
  name: string;
  description: string;
  // Its size when added, and the smallest it can be made, in columns and rows.
  size: { w: number; h: number };
  min: { w: number; h: number };
  style?: WidgetStyle;
  // Draws its own panel, so the frame adds none.
  ownCard?: boolean;
  options: OptionSpec[];
  render: (props: WidgetProps) => ReactNode;
};

// Said by a widget that needs git when the project on show isn't a git repository.
export const NO_GIT = "Needs git. This project isn't a git repository, so it has no branches or commits. Run git init in its folder to turn this on.";

// A widget that reads branches or commits: on a project without git it says why it's empty,
// instead of "Reading…" forever. `own` widgets draw their own panel, so this one draws it.
function gitOnly(render: WidgetSpec["render"], own = false): WidgetSpec["render"] {
  return (p) => {
    if (!p.data.picked || p.data.picked.git) return render(p);
    const body = (
      <>
        <Head title={p.title} />
        <Muted>{NO_GIT}</Muted>
      </>
    );
    return own ? <section className="card wf__panel" aria-label={p.title}>{body}</section> : body;
  };
}

const toggle = (key: string, label: string, value = true): OptionSpec => ({ key, label, kind: "toggle", default: value });
const count = (key: string, label: string, value: number, min: number, max: number): OptionSpec =>
  ({ key, label, kind: "number", default: value, min, max });
const choice = (key: string, label: string, choices: [string, string][], value?: string): OptionSpec =>
  ({ key, label, kind: "choice", default: value ?? choices[0][0], choices: choices.map(([v, l]) => ({ value: v, label: l })) });

export const CATALOG: WidgetSpec[] = [
  {
    type: "greeting", name: "Greeting", description: "Good morning with your name, the date and what most needs you.",
    size: { w: 8, h: 2 }, min: { w: 3, h: 2 }, style: "bare",
    options: [toggle("sky", "Show the sky for the time of day"), toggle("date", "Show the date"), toggle("status", "Show what needs you")],
    render: (p) => <Greeting {...p} />,
  },
  {
    type: "project", name: "Project on show", description: "The time, and the project picked in the menu with its branch. Opens its summary.",
    size: { w: 4, h: 2 }, min: { w: 2, h: 2 }, style: "bare",
    options: [toggle("clock", "Show the clock"), toggle("branch", "Show the branch"), toggle("path", "Show the folder", false)],
    render: (p) => <ProjectName {...p} />,
  },
  {
    type: "ai-today", name: "AI today", description: "The AI picked in Settings and what AI tools changed in this project today.",
    size: { w: 12, h: 2 }, min: { w: 4, h: 2 },
    options: [toggle("ai", "Show the AI picked in Settings"), toggle("bars", "Show one bar per prompt")],
    render: (p) => <AiToday {...p} />,
  },
  {
    type: "total-changes", name: "Total changes", description: "How much this branch changes compared with its base.",
    size: { w: 5, h: 8 }, min: { w: 2, h: 2 },
    options: [choice("view", "Show it as", [["dial", "A dial"], ["number", "A big number"], ["bar", "A bar of added and removed"]]),
              toggle("counts", "Show files, functions and commits")],
    render: gitOnly((p) => <TotalChanges {...p} />),
  },
  {
    type: "activity", name: "Today's activity", description: "Who committed to this project today, on any branch, and when.",
    size: { w: 7, h: 8 }, min: { w: 3, h: 3 },
    options: [toggle("day", "Show each person's day")],
    render: gitOnly((p) => <Activity {...p} />),
  },
  {
    type: "latest-commit", name: "Latest commit", description: "The newest commit on the branch on show, with the ones before it.",
    size: { w: 5, h: 6 }, min: { w: 3, h: 3 },
    options: [count("earlier", "Earlier commits to list", 7, 0, 12)],
    render: gitOnly((p) => <LatestCommit {...p} />),
  },
  {
    type: "branches", name: "Branches", description: "Every branch; pick one to show it across the dashboard.",
    size: { w: 7, h: 6 }, min: { w: 3, h: 3 },
    options: [toggle("merged", "List merged and deleted branches")],
    render: gitOnly((p) => <Branches {...p} />),
  },
  {
    type: "changed-files", name: "Changed files", description: "The branch's files, biggest change first; each opens in Changes.",
    size: { w: 6, h: 6 }, min: { w: 3, h: 3 },
    options: [count("count", "Files to list", 12, 3, 50), choice("sort", "Order", [["size", "Biggest change first"], ["name", "By name"]])],
    render: gitOnly((p) => <ChangedFiles {...p} />),
  },
  {
    type: "commits", name: "Branch commits", description: "The commits this branch adds to its base, newest first.",
    size: { w: 6, h: 6 }, min: { w: 3, h: 3 },
    options: [count("count", "Commits to list", 8, 3, 40), toggle("author", "Show who wrote each")],
    render: gitOnly((p) => <Commits {...p} />),
  },
  {
    type: "ai-prompts", name: "AI prompts today", description: "Today's prompts that changed code, newest first; each opens its changes.",
    size: { w: 6, h: 5 }, min: { w: 3, h: 3 },
    options: [count("count", "Prompts to list", 6, 1, 30), toggle("risky", "Only the ones that need a look", false),
              toggle("all", "From every project", false)],
    render: (p) => <AiPrompts {...p} />,
  },
];

export function spec(type: WidgetType): WidgetSpec {
  return CATALOG.find((s) => s.type === type)!;
}

// The widget's option, or its default when the person hasn't set it.
export function option(widget: PlacedWidget, key: string): Value {
  const found = spec(widget.type).options.find((o) => o.key === key);
  const value = widget.options[key];
  return value === undefined || (found && typeof value !== typeof found.default) ? found?.default ?? "" : value;
}

// --- Shared pieces --------------------------------------------------------------------------

function Head({ title, link, aside }: { title: string; link?: { label: string; go: () => void }; aside?: ReactNode }) {
  return (
    <header className="wf__head">
      <h2 className="wf__title">{title}</h2>
      {aside && <span className="wf__aside">{aside}</span>}
      {link && (
        <button className="wf__link" onClick={link.go}>
          {link.label} ›
        </button>
      )}
    </header>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="wf__muted">{children}</p>;
}

const projectChanges = (data: HomeData, all = false) =>
  (data.digest?.changes ?? []).filter((change) => all || change.repo.id === data.picked?.id);
const kept = (changes: DigestChange[]) => changes.filter((change) => !change.undone_at);

function branchTotals(comparison: Comparison) {
  const files = comparison.files.filter((file) => !file.generated);
  const additions = files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0);
  const functions = files.reduce((sum, file) => sum + file.functions.length, 0);
  return { files, additions, deletions, lines: additions + deletions, functions };
}

function todaysCommits(flow: Flow | null) {
  const today = new Date().toDateString();
  return (flow?.commits ?? []).filter((commit) => new Date(commit.authored_at).toDateString() === today);
}

// --- The widgets ----------------------------------------------------------------------------

// The welcome at the top of Home: the greeting, then one line of where things stand, led by
// a light that says whether anything needs you.
function Greeting({ data, o }: WidgetProps) {
  const moment = timeOfDay();
  const risky = kept(projectChanges(data)).filter((change) => change.risky).length;
  const broken = (data.health?.problems.length ?? 0) > 0;
  const today = data.digest ? kept(data.digest.changes).length : null;
  const status: { text: string; tone: "risk" | "calm"; go?: () => void } = broken
    ? { text: "AI recording needs a fix", tone: "risk" }
    : risky > 0
      ? { text: `${risky} AI ${risky === 1 ? "change needs" : "changes need"} a look`, tone: "risk", go: data.onDigest }
      : { text: "All caught up", tone: "calm" };
  return (
    <div className="greet">
      {o("sky") && (
        <span className={`greet__sky greet__sky--${moment.part}`} aria-hidden="true">
          <SkyIcon part={moment.part} />
        </span>
      )}
      <div className="greet__text">
        <h1>
          {moment.words}
          {data.username && <>, {data.username}</>}
        </h1>
        {(o("date") || o("status")) && (
          <p className="greet__sub">
            {o("status") &&
              (data.error ? (
                <span className="greet__mood greet__mood--risk">{data.error}</span>
              ) : status.go ? (
                <button className={`greet__mood greet__mood--${status.tone}`} onClick={status.go}>
                  {status.text}
                </button>
              ) : (
                <span className={`greet__mood greet__mood--${status.tone}`}>{status.text}</span>
              ))}
            {o("date") && <span>{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</span>}
            <span>
              {data.repos.length} {data.repos.length === 1 ? "project" : "projects"}
            </span>
            {today !== null && (
              <span>
                {today} AI {today === 1 ? "change" : "changes"} today
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

// Beside the welcome: the project and branch on show as a chip that opens the
// project's summary, and an analog chronograph with the time on this computer.
function ProjectName({ data, title, widget, o }: WidgetProps) {
  const picked = data.picked;
  return (
    <div className="onshow">
      <div className="onshow__info">
        {!picked ? (
          <Muted>Pick a project in the menu.</Muted>
        ) : (
          <button className="onshow__chip" onClick={() => data.onView("summary")} title={`${picked.path}\nOpen its summary`}>
            <span className="onshow__label">{widget.title ? title : "Viewing"}</span>
            <strong>{picked.name}</strong>
            {o("branch") && data.comparison && <code>{data.comparison.head}</code>}
          </button>
        )}
        {picked && o("path") && <span className="onshow__path">{picked.path}</span>}
      </div>
      {o("clock") && <Chrono size={104} />}
    </div>
  );
}

function AiToday({ data, title, o }: WidgetProps) {
  const [repairing, setRepairing] = useState(false);
  const [repairError, setRepairError] = useState<string | null>(null);
  const repair = () => {
    setRepairing(true);
    setRepairError(null);
    api.repairRecording().then(data.onHealth, (e: Error) => setRepairError(e.message)).finally(() => setRepairing(false));
  };
  const changes = projectChanges(data);
  const done = kept(changes);
  const additions = done.reduce((sum, change) => sum + change.additions, 0);
  const deletions = done.reduce((sum, change) => sum + change.deletions, 0);
  const files = new Set(done.flatMap((change) => change.files.map((file) => file.path))).size;
  const bars = [...changes].reverse(); // oldest first, left to right
  const most = Math.max(1, ...bars.map((c) => c.additions + c.deletions));
  const problems = data.health?.problems ?? [];
  const ai = data.ai;
  const ready = ai ? ai.available && ai.signed_in !== false : false;
  return (
    <div className="band">
      <div className="band__who">
        <h2 className="wf__title">{title}</h2>
        {o("ai") &&
          (ai ? (
            <button className="band__ai" onClick={() => data.onView("settings")} title="Pick another AI in Settings">
              <i className={`band__state${ready ? "" : " band__state--off"}`} aria-hidden="true" />
              <strong>{ai.name}</strong>
              <span>{!ai.available ? "not installed" : ai.signed_in === false ? "signed out" : ai.model}</span>
            </button>
          ) : (
            <Muted>Checking…</Muted>
          ))}
      </div>
      <div className="band__today">
        {!data.digest ? (
          <Muted>Reading today's AI changes…</Muted>
        ) : done.length === 0 ? (
          <p className="band__none">No AI changes to this project today.</p>
        ) : (
          <p className="band__numbers">
            <span>
              <strong>{done.length}</strong> {done.length === 1 ? "prompt" : "prompts"} changed
            </span>
            <span>
              <b className="wf__add">+{additions.toLocaleString()}</b> <b className="wf__del">−{deletions.toLocaleString()}</b> lines
            </span>
            <span>
              in <strong>{files}</strong> {files === 1 ? "file" : "files"}
            </span>
          </p>
        )}
        {o("bars") && bars.length > 0 && (
          <div className="band__chart">
            <div className="band__bars" aria-label="Today's prompts in this project, oldest first">
              {bars.map((change, i) => (
                <button
                  key={change.id}
                  className={`band__bar${change.risky ? " band__bar--risk" : ""}${change.undone_at ? " band__bar--undone" : ""}`}
                  onClick={() => data.onOpenChange(change.id)}
                  style={{ ["--i" as string]: i }}
                  title={promptTitle(change)}
                >
                  <b style={{ height: `${Math.max(10, ((change.additions + change.deletions) / most) * 100)}%` }} />
                </button>
              ))}
            </div>
            <p className="band__axis" aria-hidden="true">
              <span>{time(bars[0].at)}</span>
              <span>{bars.length > 1 ? time(bars[bars.length - 1].at) : ""}</span>
            </p>
          </div>
        )}
      </div>
      <button className="band__more" onClick={data.onDigest}>
        Know more
      </button>
      {problems.length > 0 && (
        <div className="band__problems" role="alert">
          {problems.map((problem) => (
            <p key={problem}>{problem}</p>
          ))}
          {repairError && <p>{repairError}</p>}
          {data.health?.repairable && (
            <button className="wf__button" onClick={repair} disabled={repairing}>
              {repairing ? "Repairing…" : "Repair the hooks"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TotalChanges({ data, title, o }: WidgetProps) {
  const comparison = data.comparison;
  if (!comparison) {
    return (
      <>
        <Head title={title} />
        <Muted>{data.picked ? `Reading ${data.picked.name}…` : "Pick a project to see its branch."}</Muted>
      </>
    );
  }
  const { files, additions, deletions, lines, functions } = branchTotals(comparison);
  const size = SIZES.find((s) => lines < s.until)!;
  const view = o("view");
  return (
    <>
      <Head
        title={title}
        aside={
          <>
            <code>{comparison.head}</code> vs <code>{comparison.base}</code>
            {comparison.behind > 0 && `, ${comparison.behind} behind`}
          </>
        }
        link={{ label: "This branch", go: () => data.onView("overview") }}
      />
      {view === "dial" ? (
        <>
          <button className="total__stage" onClick={() => data.onView("overview")} aria-label={`${lines} lines changed. Open This branch`}>
            <span className="total__bezel">
              <GaugeDial lines={lines} additions={additions} deletions={deletions} size={size.id} />
            </span>
          </button>
          <div className="total__gears" aria-label={size.label}>
            {SIZES.map((s) => (
              <span key={s.id} className={s.id === size.id ? "is-on" : ""}>
                {s.id}
              </span>
            ))}
            <em>{size.label}</em>
          </div>
          {/* In place of the dial when the widget is too small to draw it. */}
          <button className="big total__small" onClick={() => data.onView("overview")}>
            <strong>{lines.toLocaleString()}</strong>
            <span>
              lines, <b className="wf__add">+{additions.toLocaleString()}</b> <b className="wf__del">−{deletions.toLocaleString()}</b>
            </span>
          </button>
        </>
      ) : view === "number" ? (
        <button className="big" onClick={() => data.onView("overview")}>
          <strong>{lines.toLocaleString()}</strong>
          <span>
            lines changed, <b className="wf__add">+{additions.toLocaleString()}</b> <b className="wf__del">−{deletions.toLocaleString()}</b>
          </span>
          <em>{size.label}</em>
        </button>
      ) : (
        <div className="split">
          <div className="split__bar" role="img" aria-label={`${additions} lines added, ${deletions} removed`}>
            <b className="split__add" style={{ flex: Math.max(additions, 1) }} />
            <b className="split__del" style={{ flex: Math.max(deletions, additions + deletions ? deletions : 1) }} />
          </div>
          <p>
            <b className="wf__add">+{additions.toLocaleString()}</b> added, <b className="wf__del">−{deletions.toLocaleString()}</b> removed.{" "}
            {size.label}.
          </p>
        </div>
      )}
      {o("counts") && (
        <div className="total__counts">
          <button onClick={() => data.onView("changes")}>
            <strong>{files.length.toLocaleString()}</strong>
            <span>{files.length === 1 ? "file" : "files"}</span>
          </button>
          <button onClick={() => data.onView("changes")}>
            <strong>{functions.toLocaleString()}</strong>
            <span>{functions === 1 ? "function" : "functions"}</span>
          </button>
          <button onClick={() => data.onView("commits")}>
            <strong>{comparison.commits.length.toLocaleString()}</strong>
            <span>{comparison.commits.length === 1 ? "commit" : "commits"}</span>
          </button>
        </div>
      )}
    </>
  );
}

// Who committed today, from git's own author names. Teammates show up as soon as their
// commits reach this computer (Sync GitHub fetches them).
function Activity({ data, title, o }: WidgetProps) {
  const people = new Map<string, { commits: number; last: string; hours: number[] }>();
  for (const commit of todaysCommits(data.flow)) {
    const at = new Date(commit.authored_at);
    const person = people.get(commit.author) ?? { commits: 0, last: commit.authored_at, hours: [] };
    person.commits += 1;
    person.hours.push(at.getHours() + at.getMinutes() / 60);
    if (commit.authored_at > person.last) person.last = commit.authored_at;
    people.set(commit.author, person);
  }
  const rows = [...people.entries()].sort((a, b) => b[1].commits - a[1].commits || b[1].last.localeCompare(a[1].last));
  const total = rows.reduce((sum, [, person]) => sum + person.commits, 0);
  const now = new Date();
  const hourNow = now.getHours() + now.getMinutes() / 60;
  const day = Boolean(o("day"));
  return (
    <>
      <Head
        title={title}
        aside={total > 0 && `${total} ${total === 1 ? "commit" : "commits"} by ${rows.length} ${rows.length === 1 ? "person" : "people"}`}
      />
      {!data.flow ? (
        <Muted>Reading today's commits…</Muted>
      ) : rows.length === 0 ? (
        <Muted>Nobody has committed to this project today yet.</Muted>
      ) : (
        <ol className={`people${day ? "" : " people--plain"}`}>
          {rows.map(([name, person]) => (
            <li key={name}>
              <span className="people__avatar" style={{ ["--hue" as string]: hue(name) }} aria-hidden="true">
                {initials(name)}
              </span>
              <span className="people__name">
                <strong>{name}</strong>
                <span>last commit {ago(person.last)}</span>
              </span>
              {day && (
                <span className="people__day" aria-hidden="true" style={{ ["--now" as string]: `${(hourNow / 24) * 100}%` }}>
                  {person.hours.map((hour, i) => (
                    <b key={i} style={{ left: `${(hour / 24) * 100}%` }} />
                  ))}
                </span>
              )}
              <span className="people__count">
                {person.commits} {person.commits === 1 ? "commit" : "commits"}
              </span>
            </li>
          ))}
          {day && (
            <li className="people__axis" aria-hidden="true">
              <span>
                <i>0:00</i>
                <i>6:00</i>
                <i>12:00</i>
                <i>18:00</i>
              </span>
            </li>
          )}
        </ol>
      )}
      {rows.length === 1 && <p className="wf__foot">Teammates appear here once their commits reach this project.</p>}
    </>
  );
}

function LatestCommit({ data, title, o }: WidgetProps) {
  const comparison = data.comparison;
  const line = comparison ? branchLine(data.flow, comparison, 1 + Number(o("earlier"))) : [];
  const [latest, ...earlier] = line;
  return (
    <>
      <Head title={title} link={latest && { label: "All commits", go: () => data.onView("commits") }} />
      {!comparison ? (
        <Muted>Reading the branch…</Muted>
      ) : !latest ? (
        <Muted>
          No commits on <code>{comparison.head}</code> yet.
        </Muted>
      ) : (
        <>
          <article className="latest__top">
            <p className="latest__subject" title={latest.subject}>
              {latest.subject}
            </p>
            <p className="latest__meta">
              {latest.ai && (
                <span className="latest__ai" title="Written with an AI">
                  AI co-author
                </span>
              )}
              <span>{latest.author}</span>
              <span>{ago(latest.authored_at)}</span>
              <code>{latest.short_sha}</code>
            </p>
          </article>
          {earlier.length > 0 && <CommitLines commits={earlier} label="Earlier commits" />}
        </>
      )}
    </>
  );
}

function CommitLines({ commits, label, author }: { commits: { sha: string; subject: string; author: string; authored_at: string; ai: boolean }[]; label: string; author?: boolean }) {
  return (
    <ol className="lines" aria-label={label}>
      {commits.map((commit) => (
        <li key={commit.sha}>
          <span className={`lines__dot${commit.ai ? " lines__dot--ai" : ""}`} title={commit.ai ? "Written with an AI" : undefined} />
          <span className="lines__text" title={commit.subject}>
            {commit.subject}
            {author && <em> {commit.author}</em>}
          </span>
          <span className="lines__when">{ago(commit.authored_at)}</span>
        </li>
      ))}
    </ol>
  );
}

function Branches({ data, title, o }: WidgetProps) {
  const shown = data.comparison?.head ?? null;
  const branches = o("merged") ? data.branches : data.branches.filter((b) => !(b.merged || b.gone) || b.name === shown);
  return (
    <>
      <Head title={title} aside={data.branches.length > 0 && String(branches.length)} link={{ label: "Git", go: () => data.onView("git") }} />
      {data.branches.length === 0 ? (
        <Muted>Reading the branches…</Muted>
      ) : (
        <ul className="picker" role="radiogroup" aria-label="Branch to show">
          {branches.map((branch) => {
            const on = branch.name === shown;
            const note = branchNote(branch);
            return (
              <li key={branch.name}>
                <button role="radio" aria-checked={on} className={`picker__item${on ? " is-on" : ""}`} onClick={() => !on && data.onHeadChange(branch.name)}>
                  <i aria-hidden="true" />
                  <code>{branch.name}</code>
                  {branch.name === data.checkedOut && <span className="picker__tag">checked out</span>}
                  {note && <span className="picker__note">{note}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function ChangedFiles({ data, title, o }: WidgetProps) {
  const comparison = data.comparison;
  if (!comparison) {
    return (
      <>
        <Head title={title} />
        <Muted>Reading the branch…</Muted>
      </>
    );
  }
  const { files } = branchTotals(comparison);
  const sorted = [...files].sort((a, b) =>
    o("sort") === "name" ? a.path.localeCompare(b.path) : b.additions + b.deletions - (a.additions + a.deletions));
  const shown = sorted.slice(0, Number(o("count")));
  const most = Math.max(1, ...files.map((file) => file.additions + file.deletions));
  return (
    <>
      <Head title={title} aside={`${files.length} ${files.length === 1 ? "file" : "files"}`} link={{ label: "Changes", go: () => data.onView("changes") }} />
      {files.length === 0 ? (
        <Muted>
          No changes compared with <code>{comparison.base}</code> yet.
        </Muted>
      ) : (
        <ul className="files">
          {shown.map((file) => (
            <li key={file.path}>
              <button onClick={() => data.onOpenFile(file.path)} title={`Open ${file.path} in Changes`}>
                <i className={`files__status files__status--${file.status}`} />
                <span className="files__path">
                  {file.path.includes("/") && <em>{file.path.slice(0, file.path.lastIndexOf("/") + 1)}</em>}
                  {file.path.split("/").pop()}
                </span>
                <span className="files__bar" aria-hidden="true">
                  <b className="files__add" style={{ width: `${(file.additions / most) * 100}%` }} />
                  <b className="files__del" style={{ width: `${(file.deletions / most) * 100}%` }} />
                </span>
                <span className="files__lines">
                  <b className="wf__add">+{file.additions}</b> <b className="wf__del">−{file.deletions}</b>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Commits({ data, title, o }: WidgetProps) {
  const commits = data.comparison?.commits ?? [];
  return (
    <>
      <Head title={title} aside={data.comparison && String(commits.length)} link={commits.length > 0 ? { label: "Commits", go: () => data.onView("commits") } : undefined} />
      {!data.comparison ? (
        <Muted>Reading the branch…</Muted>
      ) : commits.length === 0 ? (
        <Muted>
          No commits ahead of <code>{data.comparison.base}</code> yet.
        </Muted>
      ) : (
        <CommitLines commits={commits.slice(0, Number(o("count")))} label="Commits on this branch" author={Boolean(o("author"))} />
      )}
    </>
  );
}

function AiPrompts({ data, title, o }: WidgetProps) {
  const changes = projectChanges(data, Boolean(o("all"))).filter((change) => !o("risky") || change.risky);
  return (
    <>
      <Head title={title} aside={data.digest && String(changes.length)} link={{ label: "AI changes", go: data.onDigest }} />
      {!data.digest ? (
        <Muted>Reading today's AI changes…</Muted>
      ) : changes.length === 0 ? (
        <Muted>{o("risky") ? "Nothing risky from the AI today." : "No AI changes today yet."}</Muted>
      ) : (
        <ol className="prompts">
          {changes.slice(0, Number(o("count"))).map((change) => (
            <li key={change.id}>
              <button className={change.undone_at ? "is-undone" : undefined} onClick={() => data.onOpenChange(change.id)} title={promptTitle(change)}>
                <span className="prompts__text">
                  {change.risky && <i className="prompts__risk">Needs a look</i>}
                  {change.prompt ?? "(prompt not captured)"}
                </span>
                <span className="prompts__meta">
                  {time(change.at)}
                  {o("all") && ` · ${change.repo.name}`} · <b className="wf__add">+{change.additions}</b> <b className="wf__del">−{change.deletions}</b>
                </span>
                {change.files.length > 0 && (
                  <span className="prompts__files">
                    {change.files.slice(0, 4).map((file) => (
                      <code key={file.path} title={file.path}>
                        {file.path.split("/").pop()}
                      </code>
                    ))}
                    {change.files.length > 4 && <em>+{change.files.length - 4} more</em>}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function branchLine(flow: Flow | null, comparison: Comparison, most: number): (FlowCommit | Comparison["commits"][number])[] {
  if (flow) {
    const bySha = new Map(flow.commits.map((commit) => [commit.sha, commit]));
    let at = flow.commits.find((commit) => commit.branches.includes(comparison.head));
    const line: FlowCommit[] = [];
    while (at && line.length < most) {
      line.push(at);
      at = at.parents[0] ? bySha.get(at.parents[0]) : undefined;
    }
    if (line.length) return line;
  }
  return comparison.commits.slice(0, most);
}

function promptTitle(change: DigestChange) {
  return `${time(change.at)}${change.tool ? ` · ${change.tool}` : ""}\n${change.prompt ?? "(prompt not captured)"}\n+${change.additions} −${
    change.deletions
  }${change.risky ? " · needs a look" : ""}${change.undone_at ? " · undone" : ""}`;
}

function time(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function initials(name: string) {
  const words = name.trim().split(/\s+/);
  return ((words[0]?.[0] ?? "?") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

// A steady colour per person, so the same name always gets the same avatar.
function hue(name: string) {
  let sum = 0;
  for (const char of name) sum = (sum * 31 + char.charCodeAt(0)) % 9973;
  return Math.round((sum * 137.5) % 360);
}

type Part = "night" | "morning" | "afternoon" | "evening";

// The greeting for the hour on this computer's clock.
function timeOfDay(): { part: Part; words: string } {
  const hour = new Date().getHours();
  if (hour < 5 || hour >= 22) return { part: "night", words: "Working late" };
  if (hour < 12) return { part: "morning", words: "Good morning" };
  if (hour < 17) return { part: "afternoon", words: "Good afternoon" };
  return { part: "evening", words: "Good evening" };
}

// A small picture of the sky beside the greeting: rising sun, sun, setting sun, moon.
function SkyIcon({ part }: { part: Part }) {
  const props = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8,
                  strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (part === "night") {
    return (
      <svg {...props}>
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        <path d="M17 3.5v2M16 4.5h2" />
      </svg>
    );
  }
  if (part === "afternoon") {
    return (
      <svg {...props}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
      </svg>
    );
  }
  // Morning and evening: the sun on the horizon, rising or setting.
  return (
    <svg {...props}>
      <path d="M7 17a5 5 0 0 1 10 0" />
      <path d="M3 17h18M12 7v2M5.6 10.6l1.4 1.4M18.4 10.6L17 12M3.5 21h17" />
      <path d={part === "morning" ? "M10 4.5l2-2 2 2" : "M10 2.5l2 2 2-2"} />
    </svg>
  );
}

export function ago(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return days === 1 ? "yesterday" : `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
