import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "../../api/client";
import type { AiStatus, AiTool, AiToolId, Candidate, Repo } from "../../api/types";
import ClaudeSetup from "../ClaudeSignIn/ClaudeSetup";
import "./AddProject.css";
import BrandLogo, { isBrand } from "../BrandLogo/BrandLogo";

type Props = {
  onClose: () => void;
  // A note for the person when the project was added with something turned off.
  onAdded: (repo: Repo, note?: string) => void;
  // Opens Settings → GitHub, to sign in and clone one of your repositories instead.
  onGitHub?: () => void;
  // Opens Settings → CodeCommit, to connect an AWS profile and clone from there.
  onCodeCommit?: () => void;
};

const NO_AI: AiTool = {
  id: "none",
  name: "No AI tool",
  available: true,
  description: "Show your own commits and branches. You can connect an AI tool later.",
};

// What's left to do in the tool itself once the project is added.
const AFTER: Record<string, string> = {
  codex: "Once it's added, open Codex and type /hooks to trust Looma's hooks (Codex asks once). Restart Codex if it's open.",
  antigravity: "Once it's added, restart Antigravity (agy, the app or the IDE) if it's open, so it loads Looma's hooks.",
};

export function noGitNote(repo: Repo, askedForAi = false): string {
  return (
    `${repo.name} isn't a git repository, so it was added with branches, changes, commits and pull requests off` +
    (askedForAi ? ", and without recording your AI tool, which needs git" : "") +
    ". Run git init in its folder to turn them on."
  );
}

export default function AddProject({ onClose, onAdded, onGitHub, onCodeCommit }: Props) {
  const [path, setPath] = useState("");
  const [tools, setTools] = useState<AiTool[]>([NO_AI]);
  const [ai, setAi] = useState("none");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The picked AI tool's state (installed, signed in), checked once it's picked; null while checking.
  const [status, setStatus] = useState<AiStatus | null>(null);
  const checkStatus = useCallback(() => {
    if (ai === "claude") api.ai().then(setStatus, () => {});
    else if (ai === "codex" || ai === "antigravity")
      api.aiProviders().then((list) => setStatus(list.find((item) => item.provider === ai) ?? null), () => {});
  }, [ai]);
  useEffect(() => {
    setStatus(null);
    checkStatus();
  }, [checkStatus]);

  // Projects in folders `looma init` remembered, to pick instead of typing.
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  useEffect(() => {
    api.candidates().then(setCandidates, () => {});
    api.aiTools().then((list) => setTools([NO_AI, ...list])).catch(() => {});
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const repo = await api.addRepo(path, ai === "none" ? null : (ai as AiToolId));
      onAdded(repo, repo.git ? undefined : noGitNote(repo, ai !== "none"));
    } catch (e) {
      setError((e as ApiError).message);
      setSaving(false);
    }
  };

  return (
    <div className="modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal__panel card" role="dialog" aria-labelledby="add-project-title" onSubmit={submit}>
        <h2 id="add-project-title">Add a project</h2>
        <p className="modal__lead">
          Any project folder. Looma only reads it. Without git, the summary, KT, Ask and project map still work;
          branches, changes, commits and AI recording need git.
        </p>
        {onGitHub && (
          <button type="button" className="add-github" onClick={onGitHub}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            Sign in with GitHub and clone one of your repositories
          </button>
        )}
        {onCodeCommit && (
          <button type="button" className="add-codecommit" onClick={onCodeCommit}>
            Clone from AWS CodeCommit instead
          </button>
        )}

        <label className="field">
          <span>Project folder</span>
          <input
            autoFocus
            required
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="~/Projects/MyApp"
            spellCheck={false}
          />
          <small>The full path on this computer. ~ means your home folder.</small>
        </label>

        {candidates.length > 0 && (
          <div className="candidates">
            <span className="candidates__label">Found in your folders</span>
            <div className="candidates__list">
              {candidates.map((candidate) => (
                <button
                  type="button"
                  key={candidate.path}
                  className={`candidates__item${path === candidate.path ? " candidates__item--picked" : ""}`}
                  title={candidate.path}
                  onClick={() => setPath(candidate.path)}
                >
                  {candidate.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <fieldset className="tools">
          <legend>AI tool you use here</legend>
          {tools.map((tool) => (
            <label
              key={tool.id}
              className={`tool${ai === tool.id ? " tool--selected" : ""}${tool.available ? "" : " tool--soon"}`}
            >
              <input
                type="radio"
                name="ai"
                value={tool.id}
                checked={ai === tool.id}
                disabled={!tool.available}
                onChange={() => setAi(tool.id)}
              />
              <span className="tool__name">
                {isBrand(tool.id) && <BrandLogo brand={tool.id} size={16} />}
                {tool.name}
                {!tool.available && <span className="tool__badge">Soon</span>}
              </span>
              <span className="tool__description">{tool.description}</span>
            </label>
          ))}
        </fieldset>

        {/* Picking an AI tool: get it installed and signed in right here, if it isn't yet. */}
        {ai !== "none" && status?.signed_in !== true && <ClaudeSetup ai={status} onRefresh={checkStatus} />}
        {AFTER[ai] && <p className="modal__lead">{AFTER[ai]}</p>}

        {error && <p className="modal__error">{error}</p>}

        <div className="modal__actions">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="gradient" disabled={saving || !path.trim()}>
            {saving ? "Adding…" : "Add project"}
          </Button>
        </div>
      </form>
    </div>
  );
}
