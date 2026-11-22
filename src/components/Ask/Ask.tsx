import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import type { AiStatus, AskAnswer, AskTurn } from "../../api/types";
import ClaudeSetup from "../ClaudeSignIn/ClaudeSetup";
import Logo from "../Logo/Logo";
import { clear, job, start, useJobs } from "../../lib/aiJobs";
import "./Ask.css";

// Questions about the project, answered by the AI picked in Settings: what a file or a
// function is for, how the parts fit together, where to start reading. It explains only;
// it never writes code. Answers come from the project's description, any notes saved on a
// file and the code of the files a question names.
//
// The conversation lives outside the screen (and in this browser), so an answer under way
// keeps coming, and the conversation stays, when the page is left and opened again.

type Props = {
  // The project and branch: each has its own conversation.
  scope: string;
  project: string;
  ai: AiStatus | null;
  ask: (question: string, history: AskTurn[]) => Promise<AskAnswer>;
  onSignedIn: () => void;
};

type Turn = AskTurn & { files?: string[]; read?: string[]; follow_ups?: string[] };

// Questions to start with, shown while the conversation is empty.
const STARTERS = [
  "What does this project do, and who is it for?",
  "Which commands set it up, run it and test it?",
  "How does the main flow work, step by step?",
  "How do I see what my AI changed today in Looma?",
];

// Turns kept per conversation, in memory and in this browser.
const KEPT = 40;
const STORAGE = "looma:ask:";

const chats = new Map<string, Turn[]>();

function load(scope: string): Turn[] {
  const found = chats.get(scope);
  if (found) return found;
  let saved: Turn[] = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE + scope) ?? "[]");
    if (Array.isArray(parsed)) saved = parsed.filter((t) => (t?.role === "user" || t?.role === "assistant") && typeof t.text === "string");
  } catch {
    /* storage unavailable: the conversation starts empty */
  }
  chats.set(scope, saved);
  return saved;
}

function save(scope: string, turns: Turn[]) {
  const kept = turns.slice(-KEPT);
  chats.set(scope, kept);
  try {
    localStorage.setItem(STORAGE + scope, JSON.stringify(kept));
  } catch {
    /* storage unavailable: kept until the page reloads */
  }
}

export default function Ask({ scope, project, ai, ask, onSignedIn }: Props) {
  useJobs();
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState<number | null>(null);
  const [, setVersion] = useState(0);
  const turns = load(scope);
  const key = `ask:${scope}`;
  const running = job(key);
  const busy = running?.state === "working";
  const failed = running?.state === "failed" ? running.error : null;
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const ready = !!ai?.available && ai.signed_in !== false;
  const name = ai?.name ?? "AI";

  // Keep the newest turn in view, inside the conversation only (the page itself stays put).
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns.length, busy, failed]);

  // The question box grows with what is typed, up to a few lines, then scrolls.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [draft]);

  const send = (text: string) => {
    const question = text.trim();
    if (!question || busy || !ready) return;
    const current = load(scope);
    const history: AskTurn[] = current.map(({ role, text }) => ({ role, text }));
    save(scope, [...current, { role: "user", text: question }]);
    setDraft("");
    setVersion((v) => v + 1);
    clear(key);
    // The answer is added to the conversation here, not by the screen, so it lands even
    // when the screen was left while the AI was answering. Each question is its own run.
    start(
      key,
      () =>
        ask(question, history).then((answer) => {
          save(scope, [...load(scope), { role: "assistant", text: answer.answer, files: answer.files, read: answer.read, follow_ups: answer.follow_ups }]);
          return answer;
        }),
      true,
    ).catch(() => {});
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(draft);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter starts a new line.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(draft);
    }
  };

  const retry = () => {
    const last = turns[turns.length - 1];
    if (last?.role !== "user") return;
    save(scope, turns.slice(0, -1));
    send(last.text);
  };

  const restart = () => {
    save(scope, []);
    clear(key);
    setVersion((v) => v + 1);
    input.current?.focus();
  };

  const copy = (i: number, text: string) => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(i);
        setTimeout(() => setCopied((c) => (c === i ? null : c)), 1600);
      })
      .catch(() => {});
  };

  const status = !ai ? "Checking your AI…" : !ready ? `${name} needs signing in` : busy ? `${name} is answering…` : `${name} is ready`;
  const empty = turns.length === 0 && !busy;
  const last = turns[turns.length - 1];

  const composer =
    ai && !ready ? (
      <div className="qa__setup">
        <ClaudeSetup ai={ai} onRefresh={onSignedIn} />
      </div>
    ) : (
      <form className="qa__composer" onSubmit={submit} data-tour="ask-box">
        <div className="qa__field">
          <textarea
            ref={input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder={empty ? `Ask anything about ${project}` : "Ask a follow-up"}
            rows={1}
            maxLength={2000}
            aria-label="Your question"
          />
          <div className="qa__field-row">
            <span className={`qa__model${ready ? (busy ? " qa__model--busy" : " qa__model--on") : ""}`} title={status}>
              <i aria-hidden="true" />
              {ai ? (ai.model ? `${name} · ${ai.model}` : name) : "Checking…"}
            </span>
            {draft.length > 1600 && <span className="qa__left">{2000 - draft.length} left</span>}
            <button type="submit" className="qa__send" disabled={busy || !draft.trim() || !ready} aria-label={busy ? "Answering" : "Send"} title="Send (Enter)">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M10 16V4M4.5 9.5 10 4l5.5 5.5" />
              </svg>
            </button>
          </div>
        </div>
      </form>
    );

  return (
    <div className={`qa${empty ? " qa--empty" : ""}`}>
      <header className="qa__bar">
        <span className="qa__project">
          <strong>{project}</strong>
          <span className="qa__status">{status}</span>
        </span>
        {turns.length > 0 && (
          <button className="qa__restart" onClick={restart} disabled={busy} title="Clear this conversation and start again">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 3v10M3 8h10" />
            </svg>
            New chat
          </button>
        )}
      </header>

      {empty ? (
        <div className="qa__welcome">
          <Logo size={44} className="qa__mark" />
          <h2>What would you like to know about {project}?</h2>
          {composer}
          <div className="qa__starters">
            {STARTERS.map((question) => (
              <button key={question} onClick={() => send(question)} disabled={!ready}>
                {question}
              </button>
            ))}
          </div>
          <p className="qa__note">Ask about the project or about Looma. Answers can include commands to copy; Looma never changes your files.</p>
        </div>
      ) : (
        <>
          <div className="qa__log" ref={log} aria-live="polite">
            <div className="qa__column">
              {turns.map((turn, i) =>
                turn.role === "user" ? (
                  <div key={i} className="qa__turn qa__turn--user">
                    <p className="qa__ask">{turn.text}</p>
                  </div>
                ) : (
                  <div key={i} className="qa__turn qa__turn--assistant">
                    <Logo size={24} className="qa__avatar" />
                    <div className="qa__body">
                      <div className="qa__answer">
                        <Answer text={turn.text} />
                      </div>
                      <div className="qa__tools">
                        <button className="qa__tool" onClick={() => copy(i, turn.text)} title="Copy the answer">
                          <svg viewBox="0 0 16 16" aria-hidden="true">
                            {copied === i ? <path d="M3.5 8.5l3 3 6-7" /> : <><rect x="5" y="5" width="8" height="8" rx="1.5" /><path d="M3 10.5V4a1 1 0 0 1 1-1h6.5" /></>}
                          </svg>
                          {copied === i ? "Copied" : "Copy"}
                        </button>
                        {(turn.read?.length ?? 0) > 0 && (
                          <span className="qa__read" title={turn.read!.join("\n")}>
                            Read {turn.read!.length === 1 ? turn.read![0] : `${turn.read!.length} files`}
                          </span>
                        )}
                      </div>
                      {(turn.files?.length ?? 0) > 0 && (
                        <div className="qa__files">
                          <span>Ask about</span>
                          {turn.files!.map((path) => (
                            <button
                              key={path}
                              title={`Ask what ${path} is for`}
                              onClick={() => send(`What is ${path} for, and how does it connect to the rest?`)}
                              disabled={busy || !ready}
                            >
                              {path}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ),
              )}
              {!busy && last?.role === "assistant" && (last.follow_ups?.length ?? 0) > 0 && (
                <div className="qa__next">
                  {last.follow_ups!.map((question) => (
                    <button key={question} onClick={() => send(question)} disabled={!ready}>
                      <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M4 4v4a2 2 0 0 0 2 2h6M9.5 7.5 12 10l-2.5 2.5" />
                      </svg>
                      {question}
                    </button>
                  ))}
                </div>
              )}
              {busy && (
                <div className="qa__turn qa__turn--assistant">
                  <Logo size={24} className="qa__avatar qa__avatar--thinking" />
                  <div className="qa__body">
                    <p className="qa__thinking">Reading the project…</p>
                  </div>
                </div>
              )}
              {failed && (
                <div className="qa__failed" role="alert">
                  <span>{failed}</span>
                  <button onClick={retry}>Ask again</button>
                </div>
              )}
            </div>
          </div>
          <div className="qa__dock">
            {composer}
            <p className="qa__note">
              <kbd>Enter</kbd> to send, <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line. Looma never changes your files.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// The answer's own light formatting: fenced code blocks (with their language and a Copy
// button), paragraphs, "- " and "1. " lists, `names` and **bold**. A list may follow its
// lead-in line in the same paragraph.
const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;
const FENCE = /```([\w+#.-]*)[^\n]*\n([\s\S]*?)(?:```|$)/g;

function Answer({ text }: { text: string }) {
  const pieces: ReactNode[] = [];
  let at = 0;
  for (const match of text.matchAll(FENCE)) {
    pieces.push(...prose(text.slice(at, match.index), pieces.length));
    pieces.push(<CodeBlock key={`code-${pieces.length}`} language={match[1]} code={match[2].replace(/\n$/, "")} />);
    at = match.index! + match[0].length;
  }
  pieces.push(...prose(text.slice(at), pieces.length));
  return <>{pieces}</>;
}

function prose(text: string, offset: number): ReactNode[] {
  const groups: { list: boolean; numbered: boolean; lines: string[] }[] = [];
  for (const block of text.split(/\n\s*\n/)) {
    let current: (typeof groups)[number] | null = null;
    for (const line of block.split("\n").filter((l) => l.trim())) {
      const list = BULLET.test(line);
      if (!current || current.list !== list || !list) {
        if (current && !list && !current.list) {
          current.lines.push(line);
          continue;
        }
        current = { list, numbered: list && /^\s*\d/.test(line), lines: [] };
        groups.push(current);
      }
      current.lines.push(line);
    }
  }
  return groups.map((group, i) => {
    const key = `p-${offset}-${i}`;
    if (!group.list) return <p key={key}>{inline(group.lines.join(" "))}</p>;
    const items = group.lines.map((line, j) => <li key={j}>{inline(line.replace(BULLET, ""))}</li>);
    return group.numbered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
  });
}

function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/).map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    return part;
  });
}

// A command or a piece of code, as the AI gave it, with its language and a button to copy it.
function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard
      ?.writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {});
  const shell = /^(bash|sh|shell|zsh|console|powershell|ps1|cmd)$/i.test(language);
  return (
    <div className="qa__code">
      <div className="qa__code-bar">
        <span>{language ? (shell ? "Terminal" : language) : "Code"}</span>
        <button type="button" onClick={copy} title="Copy">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}
