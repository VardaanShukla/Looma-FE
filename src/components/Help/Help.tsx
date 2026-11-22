import { useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import type { Repo, SetupStep } from "../../api/types";
import { VIEWS, type View } from "../SideMenu/SideMenu";
import "../AddProject/AddProject.css";
import "./Help.css";

// The setup steps for a project. Loaded in the app too, so the menu can show how many
// are left.
export function useSetup(repo: Repo | null) {
  const [steps, setSteps] = useState<SetupStep[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setSteps(null);
    setError(null);
    if (!repo) return;
    let stale = false;
    api
      .setup(repo.id)
      .then((result) => !stale && setSteps(result))
      .catch((e: ApiError) => !stale && setError(e.message));
    return () => {
      stale = true;
    };
  }, [repo?.id, repo?.ai]);
  // Picking an AI tool is optional, so it doesn't count as left to do.
  const todo = steps?.filter((step) => step.done === false && step.id !== "ai").length ?? 0;
  return { steps, error, todo };
}

// What each screen is for, in more words than the menu has room for.
const GUIDE: Partial<Record<View, string>> = {
  home: "Your dashboard for the project picked in the menu. It starts with the greeting (with what needs you: AI recording that needs a fix, or AI changes to check) and the project you're looking at, AI today (the AI picked in Settings and what AI tools changed in this project today, with Know more), Total changes beside today's AI prompts, and the changed files beside the latest commit. Press Edit Home to drag widgets by their bar, resize them by their corner (or use the arrow keys, with Shift to resize), add or remove widgets, and set each one's title and options. Reset puts the starting layout back. Branch flow, Project map and This branch have their own places in the menu, and open pull requests are on Commits.",
  digest: "Every prompt you gave your AI coding tool on one day, in every connected project: the files and functions it changed and whether that's committed yet. Changes touching sign-in, payments, the database or tests, or adding something that looks like a key, come first under Needs a look. The flags come from simple rules, not AI. A prompt counts every file that changed while it ran, however the AI changed it; one changed without the tool's own edit tools (a shell command, or your own edit at the same time) is marked changed during this prompt. Work from a cloud session shows once it is committed and on a branch here, pushed and synced or pulled: any commit with an AI co-author counts, listed under its commit message and marked From a cloud session. Files written straight into the folder outside any AI prompt on this computer, with no commit, can't be told apart from your own edits, so they aren't counted here; you still see them under Changes and as uncommitted work.",
  summary: "The whole project in one place: what it is, how its parts work together, what it's built with, and who works on it. Your AI (picked in Settings) can write a plain-English description.",
  ask: "Ask anything about the project or about Looma and get a direct answer: what a file or function is for, how the parts fit together, the exact commands to set it up, run it or test it, how a change would look, or how to do something in Looma itself. Commands and code come in blocks with a Copy button. Answers come from the project's description and commands, any notes saved on its files, the code of the files your question names, and a guide to Looma's screens. Looma never changes your files. The conversation is kept per project and branch in this browser; New chat clears it.",
  overview: "How big the change is on the speedometer, how much of it was made with AI, and the latest commits.",
  flow: "Each line is a branch. A line leaves the base branch when work starts and joins it again when it is merged. Point at a dot to see that commit.",
  map: "Each box is a part of the project. An arrow from one box to another means the first uses code from the second. Glowing boxes changed on this branch.",
  changes: "One file at a time, function by function: what it looked like before, what it does now, and, from your AI, what the change improves and what it costs. Lines shows every changed line. Press j and k to move between files.",
  commits: "Every commit on this branch, newest first, with who made it and when, and the project's open pull requests on GitHub or CodeCommit.",
  project: "Add another git folder, connect your AI coding tool to record the request behind each change, or remove a project.",
  settings: "Dark or light, whether uncommitted work shows from the start, your password and signing out, GitHub (connect your account to clone your repositories as projects and see open pull requests), CodeCommit (pick one of your AWS profiles for the same, with no keys kept by Looma), and the shortcut keys: click a key to change it. Settings are saved by Looma, so every browser you sign in from gets the same.",
};

const COLOURS = [
  { swatch: "var(--dd-add)", text: "Added: new lines and new files" },
  { swatch: "var(--dd-del)", text: "Removed: deleted lines and files" },
  { swatch: "var(--dd-mod)", text: "Changed: files that were edited" },
  { swatch: "var(--dd-accent)", text: "Glowing: part of the branch on screen" },
  { swatch: "#f59e0b", text: "Gold dot: a commit made with AI" },
];

// The Help screen: the setup steps for this project beside a guide to every screen.
export default function Help({ repo, steps, error, onTour }: { repo: Repo; steps: SetupStep[] | null; error: string | null; onTour: () => void }) {
  const required = steps?.filter((step) => step.done !== null && step.id !== "ai") ?? [];
  const done = required.filter((step) => step.done).length;
  return (
    <div className="help">
      <section className="card help__setup">
        <header className="help__header">
          <div>
            <h2>Set up Looma</h2>
            <p className="help__note">For {repo.name}</p>
          </div>
          <button className="help__tour" onClick={onTour}>
            Take the tour
          </button>
          {steps && required.length > 0 && (
            <span className={`help__progress${done === required.length ? " help__progress--done" : ""}`}>
              {done === required.length ? "All set" : `${done} of ${required.length} done`}
            </span>
          )}
        </header>
        {error ? (
          <p className="modal__error">{error}</p>
        ) : steps === null ? (
          <p className="help__note">Checking…</p>
        ) : (
          <ol className="steps">
            {steps.map((step) => (
              <Step key={step.id} step={step} />
            ))}
          </ol>
        )}
      </section>

      <section className="card help__guide">
        <h2>What each screen shows</h2>
        <ul className="guide">
          {VIEWS.filter((item) => GUIDE[item.id]).map((item, i) => (
            <li key={item.id}>
              <span className="guide__icon">{item.icon}</span>
              <div>
                <h3>
                  {item.label} <kbd>{i + 1}</kbd>
                </h3>
                <p>{GUIDE[item.id]}</p>
              </div>
            </li>
          ))}
        </ul>
        <h2 className="help__subheading">Colours</h2>
        <ul className="colours">
          {COLOURS.map((colour) => (
            <li key={colour.text}>
              <span style={{ background: colour.swatch }} />
              {colour.text}
            </li>
          ))}
        </ul>
      </section>
      <footer className="help__credit">
        Looma was created by{" "}
        <a href="https://github.com/VardaanShukla" target="_blank" rel="noreferrer">
          Vardaan Shukla
        </a>
        . Open source under the Apache License 2.0.
      </footer>
    </div>
  );
}

function Step({ step }: { step: SetupStep }) {
  const [copied, setCopied] = useState(false);
  const state = step.done === true ? "done" : step.done === false ? "todo" : "info";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(step.command ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; the text is still selectable */
    }
  };

  return (
    <li className={`step step--${state}`}>
      <span className="step__mark" aria-label={state === "done" ? "Done" : state === "todo" ? "Not done" : "To do yourself"}>
        {state === "done" ? "✓" : state === "todo" ? "" : "i"}
      </span>
      <div className="step__body">
        <h3>{step.title}</h3>
        <p>{step.detail}</p>
        {step.command && (
          <div className="step__command">
            <pre>{step.command}</pre>
            <button onClick={copy}>{copied ? "Copied" : "Copy"}</button>
          </div>
        )}
      </div>
    </li>
  );
}
