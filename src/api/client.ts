import type {
  AiStatus,
  AiProvider,
  HostedConnect,
  OllamaAdvice,
  OllamaState,
  OllamaUsage,
  AuthStatus,
  Candidate,
  RecordingHealth,
  PreferenceChange,
  Preferences,
  AiTool,
  AiToolId,
  AskAnswer,
  AskTurn,
  Branches,
  Comparison,
  KtDetail,
  KtGuide,
  Digest,
  DigestChangeDetail,
  Flow,
  CodeCommitRepo,
  CodeCommitStatus,
  GitHubRepo,
  GitHubStatus,
  PullRequests,
  FunctionDetail,
  GitAction,
  GitRequest,
  GitResult,
  GitStatus,
  FileExplanation,
  FunctionExplanation,
  KnowledgeTransfer,
  ProjectExplanation,
  ProjectMap,
  Repo,
  SetupStep,
  SignIn,
  Summary,
  Sync,
} from "./types";

// In dev, Vite forwards /api to `looma serve` (see vite.config.ts).

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

// Sent on window when the API turns this browser away for not being signed in.
export const SIGNED_OUT = "looma:signed-out";

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Can't reach the Looma backend. Start it with `looma serve`.", 0);
  }
  if (!response.ok) {
    // The dashboard's sign-in ran out or was ended elsewhere: show the login again.
    if (response.status === 401 && !path.startsWith("/api/auth")) window.dispatchEvent(new Event(SIGNED_OUT));
    const body = await response.json().catch(() => null);
    const detail = typeof body?.detail === "string" ? body.detail : response.statusText;
    // The dev proxy answers 5xx when nothing is listening on the backend's port.
    if (response.status >= 500 && !body) {
      throw new ApiError("Can't reach the Looma backend. Start it with `looma serve`.", 0);
    }
    // A route the running backend doesn't know: it was started before an update.
    if (response.status === 405) {
      throw new ApiError("The running backend is older than this page. Stop `looma serve` and start it again.", 405);
    }
    throw new ApiError(detail, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const get = <T>(path: string) => request<T>(path);

export const api = {
  auth: () => get<AuthStatus>("/api/auth"),
  logIn: (username: string, password: string) =>
    request<AuthStatus>("/api/auth/login", "POST", { username, password }),
  setUsername: (username: string, current: string) => request<AuthStatus>("/api/auth/username", "PUT", { username, current }),
  logOut: () => request<AuthStatus>("/api/auth/logout", "POST", {}),
  // Leave the username out to keep the current one.
  setPassword: (username: string | undefined, password: string, current?: string) =>
    request<AuthStatus>("/api/auth/password", "PUT", { username, password, current }),
  preferences: () => get<Preferences>("/api/preferences"),
  setPreferences: (changes: PreferenceChange) => request<Preferences>("/api/preferences", "PUT", changes),
  resetShortcuts: () => request<Preferences>("/api/preferences/reset-shortcuts", "POST", {}),
  resetHome: () => request<Preferences>("/api/preferences/reset-home", "POST", {}),
  repos: () => get<Repo[]>("/api/repos"),
  addRepo: (path: string, ai: AiToolId | null) => request<Repo>("/api/repos", "POST", { path, ai }),
  // The server only takes JSON for changes, so even a delete sends an empty object.
  removeRepo: (repoId: number) => request<void>(`/api/repos/${repoId}`, "DELETE", {}),
  setAi: (repoId: number, ai: AiToolId | null) => request<Repo>(`/api/repos/${repoId}/ai`, "PUT", { ai }),
  setup: (repoId: number) => get<{ steps: SetupStep[] }>(`/api/repos/${repoId}/setup`).then((r) => r.steps),
  aiTools: () => get<AiTool[]>("/api/ai-tools"),
  candidates: () => get<Candidate[]>("/api/repos/candidates"),
  recordingHealth: () => get<RecordingHealth>("/api/recording/health"),
  repairRecording: () => request<RecordingHealth>("/api/recording/repair", "POST", {}),
  branches: (repoId: number) => get<Branches>(`/api/repos/${repoId}/branches`),
  sync: (repoId: number) => request<Sync>(`/api/repos/${repoId}/sync`, "POST", {}),
  state: (repoId: number, uncommitted: boolean) =>
    get<{ signature: string }>(`/api/repos/${repoId}/state?uncommitted=${uncommitted}`).then((r) => r.signature),
  git: (repoId: number) => get<GitStatus>(`/api/repos/${repoId}/git`),
  // preview: only the commands it would run, and what they do; nothing runs.
  gitAction: (repoId: number, action: GitAction, body: GitRequest = {}, preview = false) =>
    request<GitResult>(`/api/repos/${repoId}/git/${action}`, "POST", { ...body, preview }),
  // A commit message for what's added, from the AI picked in Settings.
  suggestCommitMessage: (repoId: number) =>
    request<{ message: string }>(`/api/repos/${repoId}/git/suggest-message`, "POST", {}).then((r) => r.message),
  flow: (repoId: number) => get<Flow>(`/api/repos/${repoId}/flow`),
  map: (repoId: number, head: string) =>
    get<ProjectMap>(`/api/repos/${repoId}/map?${new URLSearchParams({ head })}`),
  compare: (repoId: number, options: CompareOptions) => {
    const params = new URLSearchParams();
    if (options.base) params.set("base", options.base);
    if (options.head) params.set("head", options.head);
    if (options.uncommitted) params.set("uncommitted", "true");
    return get<Comparison>(`/api/repos/${repoId}/compare?${params}`);
  },
  // The functions one file's change touched, before and after.
  functions: (repoId: number, file: { path: string; old_path: string | null }, options: CompareOptions) => {
    const params = new URLSearchParams({ path: file.path });
    if (file.old_path) params.set("old_path", file.old_path);
    if (options.base) params.set("base", options.base);
    if (options.head) params.set("head", options.head);
    if (options.uncommitted) params.set("uncommitted", "true");
    return get<{ path: string; functions: FunctionDetail[] }>(`/api/repos/${repoId}/functions?${params}`).then(
      (r) => r.functions,
    );
  },
  explainFunction: (repoId: number, file: { path: string; old_path: string | null }, name: string, options: CompareOptions) =>
    request<FunctionExplanation>(`/api/repos/${repoId}/explain/function`, "POST", {
      path: file.path,
      old_path: file.old_path,
      name,
      ...options,
    }),
  ai: () => get<AiStatus>("/api/ai"),
  aiProviders: () => get<AiStatus[]>("/api/ai/providers"),
  ollama: () => get<OllamaState>("/api/ollama"),
  // confirm: the person said yes to Looma asking for their password (the Linux service).
  ollamaStart: (confirm = false) => request<OllamaState>("/api/ollama/start", "POST", { confirm }),
  ollamaStop: (confirm = false) => request<OllamaState>("/api/ollama/stop", "POST", { confirm }),
  ollamaUsage: () => get<OllamaUsage>("/api/ollama/usage"),
  ollamaAdvice: () => get<OllamaAdvice>("/api/ollama/advice"),
  ollamaPull: (name: string) => request<OllamaState>("/api/ollama/pull", "POST", { name }),
  ollamaLoad: (name: string) => request<OllamaState>("/api/ollama/load", "POST", { name }),
  ollamaUnload: (name: string) => request<OllamaState>("/api/ollama/unload", "POST", { name }),
  ollamaRemove: (name: string) => request<OllamaState>("/api/ollama/remove", "POST", { name }),
  connectHosted: (connection: HostedConnect) => request<AiStatus>("/api/ai/hosted", "POST", connection),
  forgetHosted: () => request<AiStatus>("/api/ai/hosted", "DELETE", {}),
  signIn: (provider: AiProvider = "claude") => request<SignIn>("/api/ai/sign-in", "POST", { provider }),
  signInStatus: () => get<SignIn>("/api/ai/sign-in"),
  signInCode: (code: string) => request<SignIn>("/api/ai/sign-in/code", "POST", { code }),
  summary: (repoId: number, head: string) =>
    get<Summary>(`/api/repos/${repoId}/summary?${new URLSearchParams({ head })}`),
  // fresh: write it again, as when the file-by-file notes have filled in since.
  explainProject: (repoId: number, head: string, fresh = false) =>
    request<ProjectExplanation>(`/api/repos/${repoId}/explain/project`, "POST", { head, fresh }),
  // The short KT, when it's written for the project as it stands.
  ktGuide: (repoId: number, head: string) => get<{ guide: KtGuide | null }>(`/api/repos/${repoId}/kt/guide?${new URLSearchParams({ head })}`),
  writeKtGuide: (repoId: number, head: string, fresh = false) => request<KtGuide>(`/api/repos/${repoId}/kt/guide`, "POST", { head, fresh }),
  ktImageUrl: (repoId: number, head: string, path: string) => `/api/repos/${repoId}/kt/image?${new URLSearchParams({ head, path })}`,
  // Every file with the notes written so far: what Ask and Changes read.
  kt: (repoId: number, head: string) => get<KnowledgeTransfer>(`/api/repos/${repoId}/kt?${new URLSearchParams({ head })}`),
  // Every file with what it depends on and what uses it, for the detailed KT.
  // worktree: the working folder rather than the branch; left out, the server picks.
  ktDetail: (repoId: number, head: string, worktree?: boolean) =>
    get<KtDetail>(`/api/repos/${repoId}/kt/detail?${new URLSearchParams({ head, ...(worktree === undefined ? {} : { worktree: String(worktree) }) })}`),
  // Asks the AI for the detailed KT's words; fresh: write them again.
  writeKtDetail: (repoId: number, head: string, worktree: boolean, fresh = false) =>
    request<KtDetail>(`/api/repos/${repoId}/kt/detail`, "POST", { head, worktree, fresh }),
  // fresh: write the note again, as when the detailed KT is written again.
  explainFile: (repoId: number, path: string, head: string, fresh = false, worktree = false) =>
    request<FileExplanation>(`/api/repos/${repoId}/explain/file`, "POST", { path, head, fresh, worktree }),
  github: () => get<GitHubStatus>("/api/github"),
  // Starts GitHub's device sign-in; the answer has the code to enter on GitHub.
  githubConnect: (method: "app" | "gh" = "app") => request<GitHubStatus>("/api/github/connect", "POST", { method }),
  // Connects with a token pasted from GitHub's settings.
  githubToken: (token: string) => request<GitHubStatus>("/api/github/token", "POST", { token }),
  // Whether the code was entered yet; connected once it was.
  githubPoll: () => request<GitHubStatus>("/api/github/poll", "POST", {}),
  githubDisconnect: () => request<GitHubStatus>("/api/github", "DELETE", {}),
  githubRepos: () => get<GitHubRepo[]>("/api/github/repos"),
  // Clones one of your repositories into the folder and adds it as a project.
  githubClone: (fullName: string, folder: string) => request<Repo>("/api/github/clone", "POST", { full_name: fullName, folder }),
  codecommit: () => get<CodeCommitStatus>("/api/codecommit"),
  // Connects with one of this computer's AWS profiles, in one region.
  codecommitConnect: (profile: string, region: string) => request<CodeCommitStatus>("/api/codecommit/connect", "POST", { profile, region }),
  codecommitDisconnect: () => request<CodeCommitStatus>("/api/codecommit", "DELETE", {}),
  codecommitRepos: () => get<CodeCommitRepo[]>("/api/codecommit/repos"),
  // Clones one of the region's repositories into the folder and adds it as a project.
  codecommitClone: (name: string, folder: string) => request<Repo>("/api/codecommit/clone", "POST", { name, folder }),
  pulls: (repoId: number) => get<PullRequests>(`/api/repos/${repoId}/pulls`),
  // A question about the project, answered in plain words; history is the conversation so far.
  ask: (repoId: number, question: string, history: AskTurn[], head: string) =>
    request<AskAnswer>(`/api/repos/${repoId}/ask`, "POST", { question, history, head }),
  digest: (day?: string, repo?: number) => {
    const query = new URLSearchParams();
    if (day) query.set("day", day);
    if (repo !== undefined) query.set("repo", String(repo));
    const text = query.toString();
    return get<Digest>(`/api/digest${text ? `?${text}` : ""}`);
  },
  digestChange: (id: string) => get<DigestChangeDetail>(`/api/digest/change?${new URLSearchParams({ id })}`),
  // What one function (or file) of a prompt's change does, and what the prompt changed in it.
  explainChangePart: (change: string, path: string, name: string) =>
    request<FunctionExplanation>("/api/digest/explain", "POST", { change, path, name }),
  undoChange: (change: string) =>
    request<{ change: string; undone_at: string | null }>("/api/digest/undo", "POST", { change }),
  putBackChange: (change: string) =>
    request<{ change: string; undone_at: string | null }>("/api/digest/put-back", "POST", { change }),
};

export type CompareOptions = { base?: string; head?: string; uncommitted?: boolean };
