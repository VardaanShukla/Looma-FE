// Mirrors the response models in looma-be/src/looma/api/app.py.

export type Repo = {
  id: number;
  name: string;
  path: string;
  // The folder is still there.
  exists: boolean;
  // It's a git repository. Without git, branches, changes, commits, pull requests and AI
  // recording are off; the summary, KT, Ask and the project map still work.
  git: boolean;
  branch: string | null;
  claude: boolean;
  ai: AiToolId | null;
};

export type AiToolId = "claude" | "codex" | "antigravity";

export type AiTool = {
  id: string;
  name: string;
  available: boolean;
  description: string;
};

export type SetupStep = {
  id: string;
  title: string;
  detail: string;
  command: string | null;
  // null where Looma can't check, such as restarting Claude Code.
  done: boolean | null;
};

export type BranchInfo = {
  name: string;
  // Already part of the base branch.
  merged: boolean;
  // Its upstream was deleted on the remote, usually after a merged pull request.
  gone: boolean;
  // When Looma stops listing a merged or deleted branch; null for an open one.
  removes_at: string | null;
};

export type Branches = {
  current: string | null;
  default_base: string | null;
  branches: string[];
  details: BranchInfo[];
};

export type Sync = {
  synced_at: string | null;
  error: string | null;
};

export type Commit = {
  sha: string;
  short_sha: string;
  author: string;
  authored_at: string;
  subject: string;
  ai: boolean;
};

export type Line = {
  kind: "add" | "delete" | "context";
  text: string;
  old: number | null;
  new: number | null;
};

export type Hunk = {
  old_start: number;
  old_lines: number;
  new_start: number;
  new_lines: number;
  context: string | null;
  lines: Line[];
};

export type FunctionChange = {
  name: string;
  change: "added" | "deleted" | "modified";
};

export type FileChange = {
  path: string;
  old_path: string | null;
  status: "added" | "deleted" | "modified" | "renamed";
  binary: boolean;
  generated: boolean;
  truncated: boolean;
  additions: number;
  deletions: number;
  functions: FunctionChange[];
  hunks: Hunk[];
  // Differs from the last commit; only set when uncommitted work is included.
  uncommitted: boolean;
};

export type Comparison = {
  base: string;
  // What was compared against: origin/Dev when it is newer than the local Dev.
  base_ref: string;
  head: string;
  merge_base: string;
  uncommitted: boolean;
  ahead: number;
  behind: number;
  commits: Commit[];
  files: FileChange[];
  totals: { files: number; additions: number; deletions: number };
};

export type FlowCommit = {
  sha: string;
  short_sha: string;
  parents: string[];
  author: string;
  authored_at: string;
  subject: string;
  ai: boolean;
  // Branches whose tip is this commit; remote ones as origin/name.
  branches: string[];
};

export type Flow = {
  current: string | null;
  base: string | null;
  // Newest first.
  commits: FlowCommit[];
  truncated: boolean;
};

export type MapArea = {
  // The folder, relative to the project root; "" for files at the root.
  id: string;
  name: string;
  path: string;
  // What the folder is usually for, guessed from its name.
  role: string | null;
  files: number;
  bytes: number;
  languages: { name: string; files: number }[];
  // Its biggest files, at most 150; files counts them all.
  file_list: { path: string; bytes: number }[];
};

export type ProjectMap = {
  revision: string;
  total_files: number;
  areas: MapArea[];
  // Code in source uses code in target.
  edges: { source: string; target: string; imports: number }[];
  // False when the project was too big to read every file for imports.
  complete: boolean;
};

// One side of a changed function: as it was, or as it is now.
export type UnitSide = {
  start: number;
  end: number;
  lines: number;
  code: string;
  signature: string;
  // The docstring or the comment right above it.
  doc: string | null;
  params: string[];
  returns: string | null;
  is_async: boolean;
  calls: string[];
  // Ifs, loops, catches and the like: the choices the code makes.
  decisions: number;
};

export type UnitFacts = {
  params_added: string[];
  params_removed: string[];
  calls_added: string[];
  calls_removed: string[];
  // Each pair is [before, after].
  lines: [number, number];
  decisions: [number, number];
  is_async: [boolean, boolean];
  returns: [string | null, string | null];
  doc_changed: boolean;
  signature_changed: boolean;
};

export type FunctionExplanation = {
  summary: string;
  change: string;
  improves: string[];
  tradeoffs: string[];
  check: string | null;
};

export type FunctionDetail = {
  name: string;
  // style: a rule in a style sheet; section: part of a doc; file: a whole file of any
  // other kind (settings, HTML, SQL, a script), or edits outside every function.
  kind: "function" | "method" | "component" | "class" | "type" | "style" | "section" | "file";
  change: "added" | "deleted" | "modified";
  before: UnitSide | null;
  after: UnitSide | null;
  facts: UnitFacts | null;
  used_by: { path: string; line: number; text: string }[];
  explanation: FunctionExplanation | null;
  // For a whole file: the lines that changed, as a unified diff.
  diff?: string | null;
};

// An AI that can write explanations: Claude, ChatGPT Codex, a local model (Ollama), Antigravity,
// or a model on your own server (hosted).
export type AiProvider = "claude" | "codex" | "ollama" | "antigravity" | "hosted";

// The server a hosted model is on, as Looma shows it: never the key itself.
export type HostedServer = {
  url: string;
  // OpenAI-style /v1/chat/completions (vLLM, llama.cpp, LM Studio), or Ollama's /api/chat.
  style: "openai" | "ollama";
  // The key's last four characters, "set", or null when there's none.
  key: string | null;
  headers: string[];
  // Plain http to another computer: code goes over the network unencrypted.
  unencrypted: boolean;
};

// Connecting a hosted model: the pasted curl command (read, never run), or the parts typed in.
export type HostedConnect = { curl?: string; url?: string; key?: string; model?: string };
export type AiModel = { id: string; label: string; note: string };

export type AiStatus = {
  provider: AiProvider;
  name: string;
  // How it signs in: a button here, a command run in a terminal, or no sign-in at all.
  login: "button" | "terminal" | "none" | null;
  login_command: string | null;
  // Cheapest first; empty when the tool can't list them (type one instead).
  models: AiModel[];
  default_model: string | null;
  tool: string;
  available: boolean;
  // null when Claude Code couldn't say.
  signed_in: boolean | null;
  // The signed-in account's email (or organization).
  account?: string | null;
  model: string;
  detail: string | null;
  // Claude Code's official installers for this computer, when it isn't installed.
  install?: { shell: string; command: string }[];
  // hosted only: the connected server.
  server?: HostedServer | null;
};

// Ollama on this computer, run from Settings → AI → Ollama.
export type OllamaModel = {
  name: string;
  size: number; // bytes on disk
  parameters: string | null; // e.g. "3.1B"
  family: string | null;
  loaded: boolean; // in memory now, so it answers at once
  until: string | null; // when it's unloaded if unused
};
export type OllamaPull = { name: string; status: string; completed: number; total: number; error: string | null; done: boolean };
export type OllamaState = {
  installed: boolean;
  running: boolean;
  version: string | null;
  host: string;
  // Started from Looma.
  started_here: boolean;
  // What runs it: Start and Stop go through the same thing. "service" is the Linux systemd
  // service, which takes an administrator's password.
  managed_by: "looma" | "service" | "app" | "command" | null;
  // Start and Stop ask for your password (the page asks for your OK first).
  needs_admin: boolean;
  // On this computer. An Ollama that OLLAMA_HOST points elsewhere is started and stopped there.
  local: boolean;
  models: OllamaModel[];
  pulls: OllamaPull[];
  install: { shell: string; command: string }[];
};

// This computer, and the local model that suits it best.
export type OllamaAdvice = {
  cpu: string | null;
  threads: number;
  memory_gb: number | null;
  gpu: string | null;
  gpu_memory_gb: number | null;
  recommended: string;
  reason: string;
  // Where each would run: wholly on the GPU, split with the CPU, on the CPU, or not at all.
  models: { name: string; size_gb: number; note: string; fit: "gpu" | "mixed" | "cpu" | "too_big" }[];
};

// What a local model costs the computer, for the chart on the Ollama page.
export type OllamaUsage = {
  // Empty when there's no GPU Looma can read: the CPU is shown instead.
  gpus: { name: string; percent: number; memory_used: number; memory_total: number }[];
  cpu: number | null;
  cores: number;
  memory: { used: number; total: number } | null;
  // Loaded in memory now, with the share on the GPU (0-1), as `ollama ps` shows it.
  models: { name: string; size: number; on_gpu: number }[];
  note: string | null;
};

export type SignIn = { state: "idle" | "waiting" | "signed_in" | "failed"; url: string | null; detail: string | null };

export type ProjectExplanation = {
  overview: string;
  how_it_works: string[];
  parts: { name: string; what: string }[];
  // Main things the project does, step by step, naming the files involved.
  flows?: { name: string; steps: string[] }[];
  // The files a new team member should read first, in order.
  start_here?: { path: string; why: string }[];
  state: string;
};

// One file of the project's knowledge transfer, as the AI wrote it.
export type FileExplanation = {
  purpose: string;
  functions: { name: string; what: string }[];
  connects: string;
  notes: string[];
};

export type KtFile = {
  path: string;
  part: string;
  language: string;
  bytes: number;
  explanation: FileExplanation | null;
};

export type KnowledgeTransfer = { files: KtFile[]; explained: number };

// The detailed KT. Everything but the words is read from the code; the words are the AI's
// (summary, part names, reading reasons, flows, glossary), kept only where the code bears them out.
export type KtDetailFile = {
  path: string;
  // The id of its part (see KtPart); tests are all in "checks".
  part: string;
  language: string;
  lines: number;
  bytes: number;
  depends_on: string[];
  // Files that import this one, tests left out; the tests that import it are apart.
  used_by: string[];
  tests: string[];
  flow: string;
  role: "Starts the app" | "Screen" | "Logic" | "Data" | "Helper" | "Settings" | "Docs" | "Check";
  // What the file says about itself at its top, word for word.
  own_note: string | null;
  explanation: FileExplanation | null;
};

export type KtPart = { id: string; folder: string; name: string; what: string; files: number; lines: number; languages: string[] };
export type KtFound = { name: string; files: string[] };

export type KtDetail = {
  // A branch and its commit, or the working folder with changes not committed yet.
  source: { kind: "branch" | "worktree"; branch: string | null; commit: string | null };
  revision: string;
  worktree: boolean;
  has_changes: boolean;
  // False when the project had too many files to read every import.
  complete: boolean;
  // The AI's words are written for the project as it is.
  written: boolean;
  summary: string;
  audience: string;
  problem: string;
  size: { files: number; lines: number; languages: { name: string; files: number }[] };
  parts: KtPart[];
  // Code in source uses code in target.
  links: { source: string; target: string; imports: number }[];
  reading: { path: string; why: string; after: string | null }[];
  // Each step's link says how it joins the step before, read from the imports.
  flows: { name: string; steps: { path: string; what: string; link: "uses" | "used by" | null }[] }[];
  glossary: { term: string; meaning: string }[];
  tables: KtFound[];
  settings: KtFound[];
  storage: KtFound[];
  routes: { method: string; path: string; file: string }[];
  commands: { name: string; does: string; file: string }[];
  cautions: { path: string; note: string }[];
  files: KtDetailFile[];
  explained: number;
};

// Your GitHub account, connected through Looma's GitHub App.
export type GitHubStatus = {
  // Looma's GitHub App is set up (its client ID is known).
  configured: boolean;
  // GitHub's gh tool is installed, to sign in through.
  gh: boolean;
  connected: boolean;
  // How the account was connected.
  via: "app" | "gh" | "token" | null;
  login: string | null;
  name: string | null;
  avatar: string | null;
  // Where to pick the repositories Looma may read.
  install_url: string | null;
  // While signing in: the code to enter at verify_url, and when it runs out (Unix time).
  code: string | null;
  verify_url: string | null;
  expires_at: number | null;
};

export type GitHubRepo = {
  full_name: string;
  private: boolean;
  description: string | null;
  default_branch: string | null;
  url: string | null;
  clone_url: string | null;
  updated_at: string | null;
  // The folder of the Looma project cloned from it.
  tracked: string | null;
};

export type PullRequest = {
  number: number;
  title: string;
  author: string | null;
  branch: string | null;
  base: string | null;
  draft: boolean;
  url: string;
  updated_at: string | null;
};

// Your AWS CodeCommit repositories, read through the AWS CLI with one of your AWS profiles.
// Looma keeps no AWS keys, only the profile's name and the region.
export type CodeCommitStatus = {
  // The AWS CLI is installed, to sign requests with.
  cli: boolean;
  connected: boolean;
  profile: string | null;
  region: string | null;
  // The AWS account the profile is in, and who the profile is as AWS names it.
  account: string | null;
  arn: string | null;
  // The profiles on this computer, to pick from, with the region each is set to.
  profiles: { name: string; region: string | null }[];
};

export type CodeCommitRepo = {
  name: string;
  description: string | null;
  default_branch: string | null;
  // The repository in the AWS console.
  url: string | null;
  clone_url: string | null;
  updated_at: string | null;
  // The folder of the Looma project cloned from it.
  tracked: string | null;
};

export type PullRequests = {
  // owner/name on GitHub or the name on CodeCommit; null when the project has neither remote.
  repo: string | null;
  // Where the pull requests live; null when the project has neither remote.
  host?: "github" | "codecommit" | null;
  connected: boolean;
  pulls: PullRequest[];
  error: string | null;
};

// One turn of a conversation on the Ask screen.
export type AskTurn = { role: "user" | "assistant"; text: string };

export type AskAnswer = {
  answer: string;
  // The files the answer is about, and those whose code the AI read for it.
  files: string[];
  read: string[];
  // Questions to ask next.
  follow_ups: string[];
  // How many of the project's files have a KT note, which the AI reads too.
  explained: number;
  total: number;
};

export type Summary = {
  revision: string;
  name: string;
  description: string | null;
  readme: { title: string | null; intro: string | null; first_sentence: string | null; sections: string[] } | null;
  license: string | null;
  tech: { name: string; what: string }[];
  other_dependencies: number;
  run: { where: string; name: string; command: string }[];
  entry_points: string[];
  files: number;
  bytes: number;
  languages: { name: string; files: number }[];
  parts: MapArea[];
  links: { source: string; target: string; imports: number }[];
  history: {
    commits: number;
    people: { name: string; commits: number }[];
    first: string | null;
    last: string | null;
    // Commits in each of the last 12 weeks, oldest first.
    weeks: number[];
    branches: number;
  };
  explanation: ProjectExplanation | null;
};

// How recording has gone lately, from the hook logs.
export type RecordingHealth = {
  errors: number;
  days: number;
  last_error: { at: string; event: string; detail: string } | null;
  // Event (user-prompt-submit, pre-tool-use, stop, post-commit) -> when a hook last called it.
  last_call: Record<string, string>;
  error_log: string;
  hook_log: string;
  // What needs fixing for recording to work, in plain sentences; empty when it all works.
  problems: string[];
  // Some of the problems are hooks that Repair reinstalls.
  repairable: boolean;
  // Prompts left open for hours by a session that ended; closed just now with what was recorded.
  stuck: number;
  // The AI tools some project records.
  tools: string[];
};

// A project found in a folder `looma init` remembered, not added yet.
export type Candidate = { path: string; name: string; folder: string };

export type AuthStatus = { password_set: boolean; signed_in: boolean; username?: string };

// The dashboard's settings, kept by the backend so every browser gets them.
export type Preferences = {
  theme: "dark" | "light";
  // Show uncommitted work from the start; null until picked, so the dashboard asks once.
  uncommitted: boolean | null;
  // Days AI changes keep each change's lines; older ones keep their prompt and counts. 0: for good.
  keep_diffs_days: number;
  // The first-time walkthrough was finished or skipped.
  tour_done: boolean;
  // Action -> key. Actions: view:<screen>, theme, uncommitted, sync, next-file, previous-file.
  // An empty key means the shortcut is off.
  shortcuts: Record<string, string>;
  // Which AI writes explanations, and the model picked for each (missing: its cheapest).
  ai: { provider: AiProvider; models: Partial<Record<AiProvider, string>> };
  // Home's widgets, each placed on the grid with its style and settings.
  home: HomeLayout;
};
export type WidgetType =
  | "greeting" | "project" | "ai-today" | "total-changes" | "activity" | "latest-commit" | "branches"
  | "changed-files" | "commits" | "ai-prompts";
export type WidgetStyle = "glass" | "solid" | "outline" | "tinted" | "bare";
export type WidgetAccent = "" | "blue" | "teal" | "green" | "amber" | "red" | "violet" | "pink";
// One widget on Home's 12-column grid: its column and row, its width in columns and height
// in rows, how its panel looks, the person's own title ("" for the usual one) and its options.
export type PlacedWidget = {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  style: WidgetStyle;
  accent: WidgetAccent;
  title: string;
  options: Record<string, string | number | boolean>;
};
export type HomeLayout = { widgets: PlacedWidget[] };
// What a change sends: only the settings to change; for the AI, the provider and/or the
// models of the AIs to change ("" goes back to that AI's default).
export type PreferenceChange = Omit<Partial<Preferences>, "ai"> & {
  ai?: { provider?: AiProvider; models?: Partial<Record<AiProvider, string>> };
};

// The daily digest: what Claude changed on one day, prompt by prompt.
export type DigestFlag = {
  // auth, payments, database, tests, secret: worth a careful look; config, deleted, big: worth knowing.
  kind: string;
  label: string;
  reason: string;
  line: string | null;
};
export type DigestFile = {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  functions: { name: string; change: "added" | "deleted" | "modified" }[];
  flags: DigestFlag[];
  // Changed while the prompt ran, but not through Claude's Edit or Write: a shell command,
  // or possibly your own edit made at the same time.
  watched: boolean;
};
export type DigestChange = {
  id: string;
  repo: { id: number; name: string };
  branch: string | null;
  prompt: string | null;
  // False: an AI-co-authored commit with no recorded prompt; prompt is its message.
  prompt_recorded: boolean;
  // prompt: recorded by the Claude Code hooks. commit: an AI-co-authored commit made here.
  // cloud: a Claude co-authored commit found on a branch, made where no hook ran (a cloud session).
  origin: "prompt" | "commit" | "cloud";
  // The AI tool the prompt went to (Claude, Codex or Antigravity); null for commits.
  tool: string | null;
  at: string;
  commit: { sha: string; message: string; count: number } | null;
  files: DigestFile[];
  additions: number;
  deletions: number;
  flags: DigestFlag[];
  risky: boolean;
  // Undone from the digest and not put back since.
  undone_at: string | null;
};
// One prompt's change opened from the digest, with its lines: each file's hunks and each
// part it touched (a function, or the whole file when it has none) with only its own lines.
export type DigestUnit = {
  name: string;
  kind: "function" | "file";
  change: "added" | "deleted" | "modified";
  diff: string;
  explanation: FunctionExplanation | null;
};
export type DigestChangeFile = DigestFile & { hunks: Hunk[]; units: DigestUnit[] };
export type DigestChangeDetail = Omit<DigestChange, "files"> & { files: DigestChangeFile[] };
export type Digest = {
  date: string;
  // Undone changes stay in `changes` but are left out of these numbers (`undone` counts them).
  // watched_files: changed while a prompt ran but not by its Edit or Write (shell commands, or you).
  claude: {
    prompts: number; files: number; functions: number; additions: number; deletions: number; risky: number; uncommitted: number;
    undone: number; watched_files: number;
  };
  you: { files: number; additions: number; deletions: number; commits: number };
  changes: DigestChange[];
};


// The short KT: one page on what the project is and how to get it running.
export type KtGuide = {
  overview: string;
  needs: { name: string; why: string; check: string | null }[];
  setup: { step: string; detail: string; command: string | null }[];
  run: { what: string; command: string }[];
  how_to_use: string[];
  settings: { name: string; what: string }[];
  start_here: { path: string; why: string }[];
  functions: { name: string; path: string; what: string; use: string; signature: string | null }[];
  images: { path: string; caption: string }[];
};

// The Git screen: what git sees, and the result of one step.
export type GitFile = {
  path: string;
  old_path: string | null;
  // How it changed in the next commit; null when nothing of it is added.
  staged: "added" | "modified" | "deleted" | "renamed" | "copied" | null;
  // How it changed since, not added yet; "new" for a file git doesn't track.
  unstaged: "added" | "modified" | "deleted" | "renamed" | "copied" | "new" | null;
  conflict: boolean;
};
export type GitStash = { sha: string; index: number; message: string; at: string };
export type GitBranch = { name: string; current: boolean; upstream: string | null; gone: boolean; unmerged: number };
export type GitStatus = {
  branch: string | null;
  head: string | null;
  base: string | null;
  remote: string | null;
  // The remote's address (without any login in it), and this branch's page on GitHub once it's there.
  remote_url: string | null;
  branch_url: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  pushed: boolean;
  midway: "merge" | "rebase" | "cherry-pick" | "revert" | null;
  conflicts: string[];
  files: GitFile[];
  stashes: GitStash[];
  branches: GitBranch[];
  remote_branches: string[];
  last: { id: number; action: string; summary: string; at: string; undoable: boolean; why_not: string | null } | null;
};
export type GitAction =
  | "branch-create" | "switch" | "branch-rename" | "branch-delete" | "stage" | "unstage" | "commit" | "amend"
  | "update" | "stash" | "stash-apply" | "stash-pop" | "stash-drop" | "push" | "pull" | "abort" | "continue" | "undo";
export type GitRequest = {
  name?: string;
  new_name?: string;
  start?: "current" | "base";
  force?: boolean;
  remote?: boolean;
  paths?: string[];
  message?: string;
  how?: "merge" | "rebase";
  base?: string;
  sha?: string;
};
export type GitResult = {
  commands: string[];
  summary: string;
  notes: string[];
  done: boolean;
  message: string;
  conflicts: string[];
  // Where to see it on GitHub, only once the remote was asked and has it.
  url: string | null;
};
