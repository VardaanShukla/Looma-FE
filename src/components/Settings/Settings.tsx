import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { ApiError, api } from "../../api/client";
import type { AiProvider, AiStatus, CodeCommitRepo, CodeCommitStatus, GitHubRepo, GitHubStatus, OllamaAdvice, OllamaState, OllamaUsage, PreferenceChange, Preferences, RecordingHealth, Repo } from "../../api/types";
import ClaudeSetup from "../ClaudeSignIn/ClaudeSetup";
import { SETTINGS_SECTIONS, type SettingsSection } from "../SideMenu/SideMenu";
import { FIXED, SHORTCUTS, keyLabel, keyName } from "../../shortcuts";
import "./Settings.css";
import BrandLogo from "../BrandLogo/BrandLogo";

// Settings: how Looma looks, whether uncommitted work shows from the start, the account
// (password and signing out) and the keyboard shortcuts. Saved by the backend, so every
// browser you sign in from gets the same.

type Props = {
  // The part of Settings on screen, picked in the side menu, and picking another.
  section: SettingsSection;
  onSection: (section: SettingsSection) => void;
  // No side menu on screen (no project yet): Settings' parts are picked at its top.
  standalone?: boolean;
  prefs: Preferences;
  onPrefs: (changes: PreferenceChange) => Promise<void>;
  onResetShortcuts: () => Promise<void>;
  username?: string;
  passwordSet: boolean;
  onSignOut?: () => void;
  // After setting or changing the password, so the account details are read again.
  onPasswordSet: () => void;
  // The AI picked for explanations: installed, signed in, and as whom; null while checked.
  ai: AiStatus | null;
  onAiRefresh: () => void;
  // A repository cloned from GitHub or CodeCommit, now a project.
  onCloned?: (repo: Repo) => void;
  // Where the Back button at the top goes: up a level (an AI's page back to AI), or back to
  // the screen Settings was opened from (Home, or the first-run setup).
  back?: { label: string; go: () => void };
};

export default function Settings({ section, onSection, standalone, prefs, onPrefs, onResetShortcuts, username, passwordSet, onSignOut, onPasswordSet, ai, onAiRefresh, onCloned, back }: Props) {
  // An AI can be installed, signed in or out outside Looma: look again on opening Settings.
  useEffect(() => onAiRefresh(), [onAiRefresh]);
  const [list, setList] = useState<AiStatus[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const loadAis = useCallback(() => {
    api.aiProviders().then(
      (found) => (setList(found), setListError(null)),
      (e: Error) => setListError(e.message),
    );
  }, []);
  const onAi = section === "ai" || section.startsWith("ai/");
  useEffect(() => {
    if (onAi) loadAis();
  }, [onAi, loadAis, ai]);
  const refreshAis = () => {
    loadAis();
    onAiRefresh();
  };

  const page = () => {
    switch (section) {
      case "general":
        return <Account username={username} passwordSet={passwordSet} onSignOut={onSignOut} onPasswordSet={onPasswordSet} />;
      case "appearance":
        return <Appearance prefs={prefs} onPrefs={onPrefs} />;
      case "recording":
        return <Recording />;
      case "github":
        return <GitHub onCloned={onCloned} />;
      case "codecommit":
        return <CodeCommit onCloned={onCloned} />;
      case "shortcuts":
        return <Shortcuts prefs={prefs} onPrefs={onPrefs} onReset={onResetShortcuts} />;
      case "ai":
        return <AiOverview list={list} error={listError} prefs={prefs} onOpen={onSection} />;
      default:
        return (
          <AiPage
            key={section}
            provider={section.slice(3) as AiProvider}
            status={list?.find((p) => p.provider === section.slice(3)) ?? null}
            prefs={prefs}
            onPrefs={onPrefs}
            onRefresh={refreshAis}
          />
        );
    }
  };

  return (
    <div className={`settings${standalone ? " settings--standalone" : ""}`}>
      {back && (
        <button className="settings__back" onClick={back.go}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 3.5 5.5 8l4.5 4.5" />
          </svg>
          Back to {back.label}
        </button>
      )}
      {/* With no side menu (no project yet, or a phone), Settings' parts are picked here. */}
      <label className="settings__jump">
        <span>Settings</span>
        <select className="select" value={section} onChange={(event) => onSection(event.target.value as SettingsSection)}>
          {SETTINGS_SECTIONS.flatMap((part) => [
            <option key={part.id} value={part.id}>
              {part.label}
            </option>,
            ...(part.children ?? []).map((child) => (
              <option key={child.id} value={child.id}>
                {`${part.label}: ${child.label}`}
              </option>
            )),
          ])}
        </select>
      </label>
      {page()}
    </div>
  );
}

function Appearance({ prefs, onPrefs }: { prefs: Preferences; onPrefs: Props["onPrefs"] }) {
  return (
    <div className="settings__pair">
      <section className="card settings__section">
        <h2>Theme</h2>
        <div className="settings__themes" role="radiogroup" aria-label="Theme">
          {(["dark", "light"] as const).map((theme) => (
            <button
              key={theme}
              role="radio"
              aria-checked={prefs.theme === theme}
              className={`settings__theme settings__theme--${theme}${prefs.theme === theme ? " settings__theme--on" : ""}`}
              onClick={() => onPrefs({ theme })}
            >
              <span className="settings__preview" aria-hidden="true">
                <i />
                <b />
                <b />
                <b />
              </span>
              <strong>{theme === "dark" ? "Dark" : "Light"}</strong>
              <span>{theme === "dark" ? "Black glass, white ink" : "Latte and cream, sunlit sky"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card settings__section">
        <h2>Changes</h2>
        <label className="settings__switch">
          <input
            type="checkbox"
            checked={prefs.uncommitted === true}
            onChange={(event) => onPrefs({ uncommitted: event.target.checked })}
          />
          <span className="settings__track" aria-hidden="true" />
          <span>
            <strong>Show uncommitted work</strong>
            <span className="settings__note">
              Changes, This branch and the map include edits you haven't committed yet. It applies at once and stays
              on until you turn it off; the shortcut key for it turns it on or off for a while.
            </span>
          </span>
        </label>
        <label className="settings__keep">
          <span>
            <strong>Keep AI changes' lines for</strong>
            <span className="settings__note">
              Older prompts stay in AI changes with their files and line counts, but their lines are cleared to save
              space and they can't be undone from Looma.
            </span>
          </span>
          <select
            className="select"
            value={prefs.keep_diffs_days}
            onChange={(event) => onPrefs({ keep_diffs_days: Number(event.target.value) })}
          >
            {[3, 7, 10, 14, 30, 90].map((days) => (
              <option key={days} value={days}>
                {days} days
              </option>
            ))}
            <option value={0}>Forever</option>
          </select>
        </label>
      </section>
    </div>
  );
}

// Every AI in one list: whether it's ready, and which writes explanations now. Each opens
// its own page, with its setup and model.
function AiOverview({ list, error, prefs, onOpen }: {
  list: AiStatus[] | null;
  error: string | null;
  prefs: Preferences;
  onOpen: (section: SettingsSection) => void;
}) {
  return (
    <section className="card settings__section">
      <h2>AI for explanations</h2>
      <p className="settings__note">The AI that writes Explain and Summary. Each answer is saved, so it's asked for once.</p>
      {error && <p className="settings__message settings__message--error">{error}</p>}
      <ul className="ai-list">
        {ORDER.map((id) => {
          const p = list?.find((item) => item.provider === id);
          const state = badgeState(id, p);
          const inUse = prefs.ai.provider === id;
          return (
            <li key={id}>
              <button type="button" className="ai-list__row" onClick={() => onOpen(`ai/${id}` as SettingsSection)}>
                <BrandLogo brand={id} size={18} tile />
                <span className="ai-list__name">
                  <strong>{p?.name ?? id}</strong>
                  <span>{inUse && p?.model ? `${BLURB[id]} Model: ${p.model}.` : BLURB[id]}</span>
                </span>
                {inUse && <span className="ai-list__inuse">In use</span>}
                <span className={`ai-picker__state ai-picker__state--${state}`} title={p?.detail ?? undefined}>
                  {BADGE[state]}
                </span>
                <svg className="ai-list__go" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function badgeState(id: AiProvider, p: AiStatus | undefined | null): keyof typeof BADGE {
  if (!p) return "checking";
  if (!p.available) return id === "hosted" ? "connect" : "setup";
  return p.signed_in === false ? "signin" : "ready";
}

// One AI's page: whether it writes explanations, getting it ready, and its model.
function AiPage({ provider, status, prefs, onPrefs, onRefresh }: {
  provider: AiProvider;
  status: AiStatus | null;
  prefs: Preferences;
  onPrefs: Props["onPrefs"];
  onRefresh: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const inUse = prefs.ai.provider === provider;
  const state = badgeState(provider, status);
  const use = () => onPrefs({ ai: { provider } }).then(onRefresh, (e: Error) => setError(e.message));

  return (
    <section className="card settings__section">
      <div className="settings__head">
        <span className="ai-page__title">
          <BrandLogo brand={provider} size={20} tile />
          <h2>{status?.name ?? provider}</h2>
          <span className={`ai-picker__state ai-picker__state--${state}`}>{BADGE[state]}</span>
        </span>
        {inUse ? (
          <span className="ai-list__inuse">Writes explanations</span>
        ) : (
          <button className="settings__button" onClick={use}>
            Use for explanations
          </button>
        )}
      </div>
      <p className="settings__note">{CAVEAT[provider] ?? BLURB[provider]}</p>
      {error && <p className="settings__message settings__message--error">{error}</p>}
      {status?.available && (
        <ModelPicker
          ai={status}
          chosen={prefs.ai.models[provider] ?? ""}
          onPick={(model) => onPrefs({ ai: { models: { [provider]: model } } }).then(onRefresh, (e: Error) => setError(e.message))}
        />
      )}
      {provider === "ollama" ? (
        <OllamaManager
          onChange={onRefresh}
          chosen={prefs.ai.models.ollama ?? ""}
          // No choice means the best model here, which the page's suggestion is once it's downloaded.
          onUseBest={() => onPrefs({ ai: { models: { ollama: "" } } }).then(onRefresh, (e: Error) => setError(e.message))}
        />
      ) : provider === "hosted" ? (
        <HostedSetup ai={status} onConnected={onRefresh} />
      ) : (
        <ClaudeSetup ai={status} onRefresh={onRefresh} />
      )}
    </section>
  );
}

// Where a suggested model would run on this computer.
const FIT: Record<OllamaAdvice["models"][number]["fit"], string> = {
  gpu: "Runs on your GPU.",
  mixed: "Too big for your GPU, so part runs on the CPU, slowly.",
  cpu: "Runs on the CPU, slowly.",
  too_big: "Too big for this computer's memory.",
};

function bytes(count: number): string {
  if (count >= 1e9) return `${(count / 1e9).toFixed(1)} GB`;
  if (count >= 1e6) return `${Math.round(count / 1e6)} MB`;
  return `${Math.round(count / 1e3)} KB`;
}

// What this computer has and the model picked for it, with one button to get it and use it.
function BestModel({ advice, state, inUse, busy, onGet }: { advice: OllamaAdvice; state: OllamaState; inUse: boolean; busy: boolean; onGet: () => void }) {
  const name = advice.recommended;
  const here = state.models.some((m) => m.name === name);
  const pulling = state.pulls.some((p) => p.name === name && !p.done);
  const size = advice.models.find((m) => m.name === name)?.size_gb;
  const parts = [
    advice.gpu ? `${advice.gpu}${advice.gpu_memory_gb ? ` (${advice.gpu_memory_gb} GB)` : ""}` : "No GPU found",
    [advice.cpu, `${advice.threads} threads`].filter(Boolean).join(", "),
    advice.memory_gb ? `${advice.memory_gb} GB memory` : null,
  ];
  return (
    <div className="ollama__best">
      <div>
        <h3 className="ollama__heading">Best for this computer</h3>
        <p className="settings__note">{parts.filter(Boolean).join(" · ")}</p>
        <p className="ollama__best-model">
          <code>{name}</code> {size !== undefined && <span className="ollama__size">{size.toFixed(1)} GB</span>}
        </p>
        <p className="settings__note">{advice.reason}</p>
        {!state.running && !here && <p className="settings__note">{state.installed ? "Start Ollama to download it." : "Install Ollama to download it."}</p>}
      </div>
      {here && inUse ? (
        <span className="ollama__loaded">In use</span>
      ) : (
        <button className="settings__button" disabled={busy || pulling || (!here && !state.running)} onClick={onGet}>
          {pulling ? "Downloading…" : here ? "Use this model" : "Download and use"}
        </button>
      )}
    </div>
  );
}

// Ollama run from the page: start or stop it, download models, and load one into memory
// (Run) or free it (Stop), as `ollama run` and `ollama stop` do.
function OllamaManager({ onChange, chosen, onUseBest }: { onChange: () => void; chosen: string; onUseBest: () => void }) {
  const [state, setState] = useState<OllamaState | null>(null);
  const [advice, setAdvice] = useState<OllamaAdvice | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The action under way, such as "start" or "load:qwen2.5:3b".
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  // Start or Stop waiting for your OK, because Linux will ask for your password.
  const [asking, setAsking] = useState<Switch | null>(null);
  const load = useCallback(() => {
    api.ollama().then(
      (found) => (setState(found), setError(null)),
      (e: Error) => setError(e.message),
    );
  }, []);
  useEffect(load, [load]);

  // While a download runs, read its progress every second and a half; when it ends, the
  // model list (and the model picker) are read again.
  useEffect(() => {
    api.ollamaAdvice().then(setAdvice, () => {});
  }, []);

  const pulling = Boolean(state?.pulls.some((p) => !p.done));
  const wasPulling = useRef(false);
  useEffect(() => {
    if (wasPulling.current && !pulling) onChange();
    wasPulling.current = pulling;
    if (!pulling) return;
    const timer = window.setInterval(load, 1500);
    return () => window.clearInterval(timer);
  }, [pulling, load, onChange]);

  const act = (key: string, call: () => Promise<OllamaState>) => {
    setBusy(key);
    setError(null);
    call().then(
      (found) => {
        setState(found);
        setBusy(null);
        onChange();
      },
      (e: Error) => {
        setBusy(null);
        // The backend wants the OK the page asks for before Linux asks for a password.
        if (e instanceof ApiError && e.status === 409 && (key === "start" || key === "stop")) setAsking(key);
        else setError(e.message);
      },
    );
  };
  const download = (model: string) => act(`pull:${model}`, () => api.ollamaPull(model));
  const toggle = (verb: Switch, confirmed = false) => {
    setAsking(null);
    act(verb, () => (verb === "start" ? api.ollamaStart(confirmed) : api.ollamaStop(confirmed)));
  };
  const press = (verb: Switch) => (state?.needs_admin ? (setError(null), setAsking(verb)) : toggle(verb));

  if (!state) {
    return error ? <p className="settings__message settings__message--error">{error}</p> : <p className="settings__note">Checking Ollama…</p>;
  }
  const installed = new Set(state.models.map((m) => m.name));
  const failed = error && <p className="settings__message settings__message--error">{error}</p>;
  const best = advice && state.local && (
    <BestModel
      advice={advice}
      state={state}
      inUse={!chosen || chosen === advice.recommended}
      busy={busy !== null}
      onGet={() => {
        if (chosen) onUseBest();
        if (!installed.has(advice.recommended)) download(advice.recommended);
      }}
    />
  );

  if (!state.installed) {
    return (
      <div className="ollama">
        {best}
        <p className="ollama__status">
          <span className="ollama__dot" aria-hidden="true" />
          Ollama isn't installed on this computer.
        </p>
        <p className="settings__note">Install it once, then start it here:</p>
        {state.install.map((c) => (
          <code key={c.command} className="ollama__command">
            {c.command}
          </code>
        ))}
        <div>
          <button className="settings__button settings__button--quiet" onClick={load}>
            Check again
          </button>
        </div>
        {failed}
      </div>
    );
  }

  const main = (
    <>
      <div className="ollama__bar">
        <p className="ollama__status">
          <span className={`ollama__dot${state.running ? " ollama__dot--on" : ""}`} aria-hidden="true" />
          <span>
            {state.running ? (
              <>
                Ollama {state.version} is running at <code>{state.host}</code>
              </>
            ) : (
              "Ollama is installed but not running."
            )}
            {state.local && state.managed_by && (state.running || state.managed_by !== "command") && (
              <span className="ollama__by">{MANAGED_BY[state.managed_by]}</span>
            )}
          </span>
        </p>
        {!state.local ? (
          <span className="settings__note">On another computer: start and stop it there.</span>
        ) : state.running ? (
          <button className="settings__button settings__button--quiet" disabled={busy === "stop" || asking !== null} onClick={() => press("stop")}>
            {busy === "stop" ? "Stopping…" : "Stop Ollama"}
          </button>
        ) : (
          <button className="settings__button" disabled={busy === "start" || asking !== null} onClick={() => press("start")}>
            {busy === "start" ? "Starting…" : "Start Ollama"}
          </button>
        )}
      </div>
      {asking && <AdminConfirm verb={asking} onContinue={() => toggle(asking, true)} onCancel={() => setAsking(null)} onCheck={load} />}
      {failed}
      {state.local && state.running && <UsageChart />}
    </>
  );

  if (!state.running) return <div className="ollama">{best}{main}</div>;

  return (
    <div className="ollama ollama--split">
      <div className="ollama__column">
        {best}
        {main}
        <h3 className="ollama__heading">Models on this computer</h3>
        {state.models.length === 0 ? (
          <p className="settings__note">No models yet. Download one below: a small one is enough for explanations.</p>
        ) : (
          <table className="ollama__models">
            <thead>
              <tr>
                <th scope="col">Model</th>
                <th scope="col">Size</th>
                <th scope="col" className="ollama__params">Parameters</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {state.models.map((m) => (
                <tr key={m.name}>
                  <td>
                    <code>{m.name}</code>
                    {m.loaded && <span className="ollama__loaded">Running</span>}
                  </td>
                  <td>{bytes(m.size)}</td>
                  <td className="ollama__params">{m.parameters ?? ""}</td>
                  <td>
                    <div className="ollama__actions">
                      {removing === m.name ? (
                        <>
                          <span>Delete from disk?</span>
                          <button className="settings__button settings__button--danger" onClick={() => (setRemoving(null), act(`remove:${m.name}`, () => api.ollamaRemove(m.name)))}>
                            Delete
                          </button>
                          <button className="settings__button settings__button--quiet" onClick={() => setRemoving(null)}>
                            Keep
                          </button>
                        </>
                      ) : (
                        <>
                          {m.loaded ? (
                            <button className="settings__button settings__button--quiet" disabled={busy !== null} onClick={() => act(`unload:${m.name}`, () => api.ollamaUnload(m.name))}>
                              {busy === `unload:${m.name}` ? "Stopping…" : "Stop"}
                            </button>
                          ) : (
                            <button className="settings__button settings__button--quiet" disabled={busy !== null} onClick={() => act(`load:${m.name}`, () => api.ollamaLoad(m.name))}>
                              {busy === `load:${m.name}` ? "Loading…" : "Run"}
                            </button>
                          )}
                          <button className="settings__button settings__button--quiet" disabled={busy !== null} onClick={() => setRemoving(m.name)}>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="ollama__column">
        <h3 className="ollama__heading">Download a model</h3>
        {state.pulls.length > 0 && (
          <ul className="ollama__pulls">
            {state.pulls.map((p) => {
              const share = p.total ? Math.round((p.completed / p.total) * 100) : 0;
              return (
                <li key={p.name}>
                  <span className="ollama__pull-top">
                    <code>{p.name}</code>
                    <span>{p.error ? "Download failed" : p.done ? "Downloaded" : p.total ? `${bytes(p.completed)} of ${bytes(p.total)}` : p.status}</span>
                  </span>
                  {!p.done && (
                    <progress className="ollama__progress" max={100} value={p.total ? share : undefined} aria-label={`Downloading ${p.name}`} />
                  )}
                  {p.error && (
                    <span className="settings__message settings__message--error">
                      {p.error}{" "}
                      <button className="ollama__retry" onClick={() => download(p.name)}>
                        Try again
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <form
          className="ollama__download"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) download(name.trim());
            setName("");
          }}
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Model name, like qwen2.5:3b"
            aria-label="Model name"
            spellCheck={false}
            autoComplete="off"
          />
          <button className="settings__button" disabled={!name.trim()}>
            Download
          </button>
        </form>
        <ul className="ollama__suggested">
          {advice?.models.map((s) => (
            <li key={s.name}>
              <span>
                <code>{s.name}</code> <span className="ollama__size">{s.size_gb.toFixed(1)} GB</span>
                {s.name === advice.recommended && <span className="ollama__loaded">Best here</span>}
                <span className="settings__note">{s.note} {FIT[s.fit]}</span>
              </span>
              <button
                className="settings__button settings__button--quiet"
                disabled={installed.has(s.name) || state.pulls.some((p) => p.name === s.name && !p.done)}
                onClick={() => download(s.name)}
              >
                {installed.has(s.name) ? "Downloaded" : state.pulls.some((p) => p.name === s.name && !p.done) ? "Downloading…" : "Download"}
              </button>
            </li>
          ))}
        </ul>
        <p className="settings__note">
          More models are listed at{" "}
          <a href="https://ollama.com/library" target="_blank" rel="noreferrer">
            ollama.com/library
          </a>
          . Type any name from there above.
        </p>
      </div>
    </div>
  );
}

type Switch = "start" | "stop";

// What Start and Stop go through, under the status.
const MANAGED_BY: Record<NonNullable<OllamaState["managed_by"]>, string> = {
  looma: "Started from Looma",
  service: "Runs as a Linux system service",
  app: "Runs from the Ollama app",
  command: "Started with ollama serve",
};

// Before Looma asks Linux to start or stop Ollama's system service as administrator:
// exactly what runs, what it changes, and where the password goes. The backend refuses
// the step until this was answered, so nothing reaches the password window unseen.
function AdminConfirm({ verb, onContinue, onCancel, onCheck }: {
  verb: Switch;
  onContinue: () => void;
  onCancel: () => void;
  onCheck: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const yes = useRef<HTMLButtonElement>(null);
  useEffect(() => yes.current?.focus(), []);
  const command = `systemctl ${verb} ollama`;
  const copy = () =>
    navigator.clipboard.writeText(`sudo ${command}`).then(
      () => setCopied(true),
      () => setCopied(false),
    );

  return (
    <div className="ollama__ask" role="group" aria-labelledby="ollama-ask-title" onKeyDown={(event) => event.key === "Escape" && onCancel()}>
      <h4 id="ollama-ask-title">{verb === "stop" ? "Stop" : "Start"} Ollama's system service?</h4>
      <p className="settings__note">
        Ollama was installed as a Linux service, so only an administrator can {verb} it. Here is everything Looma will do.
      </p>
      <dl className="ollama__facts">
        <dt>What runs</dt>
        <dd>
          <code>{command}</code>, as administrator. The command is fixed: nothing you type goes into it.
        </dd>
        <dt>What it changes</dt>
        <dd>
          Only the Ollama service. Your models stay on disk, and no files or other services are touched.
          {verb === "stop" && " Explanations from Ollama pause until you start it again."}
        </dd>
        <dt>Your password</dt>
        <dd>Linux asks for it in its own window. Looma never sees it and never keeps it.</dd>
      </dl>
      <div className="ollama__ask-actions">
        <button ref={yes} className="settings__button" onClick={onContinue}>
          Continue
        </button>
        <button className="settings__button settings__button--quiet" onClick={copy}>
          {copied ? "Copied" : "Copy the command"}
        </button>
        <button className="settings__button settings__button--quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {copied && (
        <p className="settings__note">
          Run <code>sudo {command}</code> in a terminal, then{" "}
          <button className="ollama__retry" onClick={onCheck}>
            check again
          </button>
          .
        </p>
      )}
    </div>
  );
}

// Two minutes of samples, one every two seconds.
const SAMPLES = 60;
const EVERY = 2000;

// The load a local model puts on the computer: the GPU when Looma can read one (NVIDIA or
// AMD), the CPU otherwise, with the memory it holds and the models loaded now.
function UsageChart() {
  const [usage, setUsage] = useState<OllamaUsage | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let stopped = false;
    const read = () => {
      if (document.hidden) return;
      api.ollamaUsage().then(
        (found) => {
          if (stopped) return;
          setUsage(found);
          setError(null);
          const value = found.gpus.length ? average(found.gpus.map((g) => g.percent)) : found.cpu;
          if (value !== null) setHistory((before) => [...before, value].slice(-SAMPLES));
        },
        (e: Error) => !stopped && setError(e.message),
      );
    };
    read();
    const timer = window.setInterval(read, EVERY);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);

  if (!usage) {
    return error ? <p className="settings__message settings__message--error">{error}</p> : null;
  }
  const gpu = usage.gpus.length > 0;
  const what = gpu ? (usage.gpus.length === 1 ? usage.gpus[0].name : `${usage.gpus.length} GPUs`) : `${usage.cores} CPU cores`;
  const memory = gpu
    ? { used: sum(usage.gpus.map((g) => g.memory_used)), total: sum(usage.gpus.map((g) => g.memory_total)), label: "Video memory" }
    : usage.memory && { ...usage.memory, label: "Memory" };
  const now = history.at(-1);

  return (
    <section className="usage" aria-labelledby="usage-title">
      <div className="usage__head">
        <span>
          <h3 id="usage-title" className="ollama__heading">
            {gpu ? "GPU use" : "CPU use"}
          </h3>
          <span className="settings__note">{what}</span>
        </span>
        {now !== undefined && <strong className="usage__now">{Math.round(now)}%</strong>}
      </div>
      <LineChart values={history} label={gpu ? "GPU use" : "CPU use"} />
      {memory && memory.total > 0 && (
        <div className="usage__memory">
          <span className="usage__memory-top">
            <span>{memory.label}</span>
            <span>
              {bytes(memory.used)} of {bytes(memory.total)}
            </span>
          </span>
          <meter min={0} max={memory.total} value={memory.used} aria-label={`${memory.label} in use`} />
        </div>
      )}
      {usage.models.length > 0 ? (
        <ul className="usage__models">
          {usage.models.map((m) => (
            <li key={m.name}>
              <code>{m.name}</code>
              <span>{m.size > 0 ? bytes(m.size) : ""}</span>
              <span>{placement(m.on_gpu)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="settings__note">No model is loaded now. Press Run on one below, or ask for an explanation.</p>
      )}
      {usage.note && <p className="settings__note">{usage.note}</p>}
    </section>
  );
}

function average(values: number[]): number {
  return sum(values) / values.length;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

// Where a loaded model sits, as `ollama ps` says it.
function placement(onGpu: number): string {
  if (onGpu >= 0.995) return "All on the GPU";
  if (onGpu <= 0.005) return "On the CPU";
  return `${Math.round(onGpu * 100)}% on the GPU`;
}

// A 0 to 100% line over the last two minutes, newest on the right. Hover for a reading.
function LineChart({ values, label }: { values: number[]; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const watch = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    watch.observe(node);
    return () => watch.disconnect();
  }, []);

  const height = 150;
  const left = 36;
  const right = 10;
  const top = 10;
  const bottom = 22;
  const x = (i: number) => left + ((width - left - right) * (SAMPLES - values.length + i)) / (SAMPLES - 1);
  const y = (v: number) => top + (height - top - bottom) * (1 - Math.min(100, Math.max(0, v)) / 100);
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = values.length > 1 ? `${line}L${x(values.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : "";
  const last = values.length - 1;
  const shown = hover ?? last;

  const pick = (event: PointerEvent<SVGSVGElement>) => {
    if (values.length === 0) return;
    const at = event.clientX - event.currentTarget.getBoundingClientRect().left;
    const i = Math.round(((at - left) * (SAMPLES - 1)) / (width - left - right)) - (SAMPLES - values.length);
    setHover(Math.min(last, Math.max(0, i)));
  };
  const ago = (i: number) => {
    const seconds = ((last - i) * EVERY) / 1000;
    return seconds === 0 ? "now" : `${seconds} s ago`;
  };

  return (
    <div className="usage__chart" ref={box}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={values.length ? `${label} over the last two minutes, ${Math.round(values[last])}% now` : `${label}: reading`}
        onPointerMove={pick}
        onPointerLeave={() => setHover(null)}
      >
        {[0, 50, 100].map((tick) => (
          <g key={tick}>
            <line className="usage__grid" x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} />
            <text className="usage__tick" x={left - 8} y={y(tick)} dy="0.32em" textAnchor="end">
              {tick}%
            </text>
          </g>
        ))}
        <text className="usage__tick" x={left} y={height - 4}>
          2 min ago
        </text>
        <text className="usage__tick" x={width - right} y={height - 4} textAnchor="end">
          now
        </text>
        {area && <path className="usage__area" d={area} />}
        {values.length > 1 && <path className="usage__line" d={line} />}
        {hover !== null && <line className="usage__cross" x1={x(hover)} x2={x(hover)} y1={top} y2={y(0)} />}
        {values.length > 0 && <circle className="usage__dot" cx={x(shown)} cy={y(values[shown])} r={4.5} />}
      </svg>
      {values.length < 2 && <span className="usage__wait">Reading…</span>}
      {hover !== null && (
        <span className="usage__tip" style={{ left: Math.min(width - 90, Math.max(0, x(hover) - 45)), top: Math.max(0, y(values[hover]) - 52) }}>
          <strong>{Math.round(values[hover])}%</strong>
          <span>{ago(hover)}</span>
        </span>
      )}
    </div>
  );
}

// What each AI is, in a line.
const BLURB: Record<AiProvider, string> = {
  claude: "Uses your Claude plan.",
  codex: "Uses your ChatGPT plan.",
  ollama: "On this computer. Free and private.",
  antigravity: "Uses your Google account. Experimental.",
  hosted: "Ollama, vLLM, llama.cpp or LM Studio.",
};
// Shown under the picker for the one picked, when there's more to know.
const CAVEAT: Partial<Record<AiProvider, string>> = {
  antigravity: "Antigravity is experimental: the request goes on its command line, where other accounts on this computer can see it.",
};
// The badge on each AI's card: a word or two; the setup below says the rest.
const BADGE = { checking: "Checking…", ready: "Ready", signin: "Sign in", setup: "Set up", connect: "Connect" };
const ORDER: AiProvider[] = ["claude", "codex", "ollama", "antigravity", "hosted"];

// Choosing the AI that writes explanations: each with whether it's ready, the setup steps
// for the one picked (install, sign in), and its model. Also on the first-run screen.
export function AiPicker({ prefs, onPrefs, onActiveChange, active }: {
  prefs: Preferences;
  onPrefs: (changes: PreferenceChange) => Promise<void>;
  // The AI in use changed, or may have (signed in, installed): read it again.
  onActiveChange: () => void;
  // The AI in use, as the dashboard last read it; refreshes the list when it changes.
  active?: AiStatus | null;
}) {
  const [list, setList] = useState<AiStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api.aiProviders().then(
      (found) => (setList(found), setError(null)),
      (e: Error) => setError(e.message),
    );
  }, []);
  useEffect(load, [load, active]);

  const chosen = prefs.ai.provider;
  const current = list?.find((p) => p.provider === chosen) ?? null;
  const pick = (provider: AiProvider) =>
    onPrefs({ ai: { provider } }).then(onActiveChange, (e: Error) => setError(e.message));
  const refresh = () => {
    load();
    onActiveChange();
  };

  return (
    <div className="ai-picker">
      <div className="ai-picker__options" role="radiogroup" aria-label="AI for explanations">
        {ORDER.map((id) => {
          const p = list?.find((item) => item.provider === id);
          const state = !p
            ? "checking"
            : !p.available
              ? id === "hosted" ? "connect" : "setup"
              : p.signed_in === false ? "signin" : "ready";
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={chosen === id}
              className={`ai-picker__option${chosen === id ? " ai-picker__option--on" : ""}`}
              onClick={() => chosen !== id && pick(id)}
            >
              <span className="ai-picker__top">
                <span className="ai-picker__name">
                  <BrandLogo brand={id} size={16} />
                  <strong>{p?.name ?? id}</strong>
                </span>
                <span className={`ai-picker__state ai-picker__state--${state}`} title={p?.detail ?? undefined}>
                  {BADGE[state]}
                </span>
              </span>
              <span className="ai-picker__blurb">{BLURB[id]}</span>
            </button>
          );
        })}
      </div>
      {error && <p className="settings__message settings__message--error">{error}</p>}
      {CAVEAT[chosen] && <p className="settings__note">{CAVEAT[chosen]}</p>}
      {chosen === "hosted" ? (
        <HostedSetup ai={current} onConnected={refresh} />
      ) : (
        <ClaudeSetup ai={current} onRefresh={refresh} />
      )}
      {current?.available && (
        <ModelPicker
          key={current.provider}
          ai={current}
          chosen={prefs.ai.models[chosen] ?? ""}
          onPick={(model) => onPrefs({ ai: { models: { [chosen]: model } } }).then(refresh, (e: Error) => setError(e.message))}
        />
      )}
    </div>
  );
}

// The model for the AI picked: its models cheapest first, or any name typed in.
function ModelPicker({ ai, chosen, onPick }: { ai: AiStatus; chosen: string; onPick: (model: string) => void }) {
  const known = ai.models.some((m) => m.id === chosen);
  const [typing, setTyping] = useState(Boolean(chosen) && !known);
  const [text, setText] = useState(known ? "" : chosen);
  const shown = typing ? "__other" : chosen || ai.default_model || "";
  const note = ai.models.find((m) => m.id === (chosen || ai.default_model))?.note;
  const save = () => text.trim() !== chosen && onPick(text.trim());

  return (
    <div className="ai-picker__model">
      <label>
        <span>Model</span>
        <select
          className="select"
          value={shown}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "__other") return setTyping(true);
            setTyping(false);
            // The default is stored as no choice, so a later, cheaper default reaches it.
            onPick(value === ai.default_model ? "" : value);
          }}
        >
          {ai.provider === "antigravity" && <option value="">Antigravity's own choice</option>}
          {ai.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
              {m.id === ai.default_model ? (ai.provider === "hosted" ? " · default" : ai.provider === "ollama" ? " · default, best for this computer" : " · default, fewest tokens") : ""}
            </option>
          ))}
          <option value="__other">Another model (type its name)…</option>
        </select>
      </label>
      {typing && (
        <input
          className="ai-picker__custom"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => event.key === "Enter" && save()}
          placeholder={ai.provider === "ollama" || ai.provider === "hosted" ? "e.g. llama3.2:3b" : ai.provider === "antigravity" ? "a model name, as agy's /model shows it" : "model name"}
          spellCheck={false}
          autoFocus
        />
      )}
      <p className="settings__note">
        {!typing && note ? `${note} ` : ""}
        {ai.provider === "ollama" || ai.provider === "hosted"
          ? "Your own models use no tokens; smaller ones answer faster."
          : "Smaller models use fewer tokens; bigger ones explain tricky code better."}
      </p>
    </div>
  );
}

const CURL_EXAMPLE = `curl http://your-server:8000/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -d '{"model": "qwen2.5:7b", "messages": [...]}'`;

// Connecting a model on your own server: paste the curl command that reaches it, or type its
// address, key and model. Looma reads the command, never runs it, asks the model a test
// question, and keeps the key to itself: the page only ever sees its last four characters.
function HostedSetup({ ai, onConnected }: { ai: AiStatus | null; onConnected: () => void }) {
  const server = ai?.server ?? null;
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState(false);
  const [curl, setCurl] = useState("");
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const connection = typed ? { url: url.trim(), key: key.trim() || undefined, model: model.trim() || undefined } : { curl };
    api.connectHosted(connection).then(
      (status) => {
        // The paste holds the key: don't keep it on the page.
        setCurl("");
        setKey("");
        setBusy(false);
        setEditing(false);
        setMessage({ ok: true, text: `Connected. ${status.model} answered, and now writes explanations.` });
        onConnected();
      },
      (e: Error) => {
        setBusy(false);
        setMessage({ ok: false, text: e.message });
      },
    );
  };
  const forget = () =>
    api.forgetHosted().then(
      () => (setMessage(null), onConnected()),
      (e: Error) => setMessage({ ok: false, text: e.message }),
    );

  return (
    <div className="hosted">
      {server && (
        <div className="hosted__server">
          <span>
            {ai?.available ? "Connected to" : "Can't reach"} <code>{server.url}</code>
            {server.key ? <> · key {server.key}</> : " · no key"}
            {server.style === "ollama" ? " · Ollama API" : " · OpenAI-style API"}
          </span>
          <span className="hosted__actions">
            {!editing && (
              <button type="button" className="settings__button settings__button--quiet" onClick={() => setEditing(true)}>
                Change
              </button>
            )}
            <button type="button" className="settings__button settings__button--quiet" onClick={forget}>
              Disconnect
            </button>
          </span>
        </div>
      )}
      {server && !ai?.available && ai?.detail && <p className="settings__message settings__message--error">{ai.detail}</p>}
      {server?.unencrypted && (
        <p className="hosted__warning">
          This address is plain http to another computer, so your code goes over the network unencrypted. Use https, or
          a private network such as a VPN or Tailscale.
        </p>
      )}
      {(!server || editing) && (
        <form className="settings__form" onSubmit={submit}>
          {typed ? (
            <>
              <label>
                <span>Address</span>
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://your-server:8000/v1" spellCheck={false} />
              </label>
              <label>
                <span>API key (if it needs one)</span>
                <input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
              </label>
              <label>
                <span>Model (leave empty for the first it lists)</span>
                <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. qwen2.5:7b" spellCheck={false} />
              </label>
            </>
          ) : (
            <label>
              <span>The curl command that reaches your model</span>
              <textarea
                className="hosted__curl"
                value={curl}
                onChange={(e) => setCurl(e.target.value)}
                placeholder={CURL_EXAMPLE}
                rows={5}
                spellCheck={false}
                autoComplete="off"
              />
            </label>
          )}
          <p className="settings__note">
            Looma only reads the command, it never runs it. The key stays in Looma on this computer and isn't shown
            again.
          </p>
          <div className="settings__form-end">
            <button type="button" className="hosted__switch" onClick={() => (setTyped(!typed), setMessage(null))}>
              {typed ? "Paste a curl command instead" : "Or type the address, key and model"}
            </button>
            <span className="hosted__actions">
              {editing && (
                <button type="button" className="settings__button settings__button--quiet" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              )}
              <button className="settings__button" disabled={busy || (typed ? !url.trim() : !curl.trim())}>
                {busy ? "Testing…" : "Test and connect"}
              </button>
            </span>
          </div>
          {busy && <p className="settings__note">Asking the model a test question. The first answer can take a minute while the server loads it.</p>}
        </form>
      )}
      {message && <p className={`settings__message${message.ok ? "" : " settings__message--error"}`}>{message.text}</p>}
    </div>
  );
}

// Your account: who's signed in, changing the name and the password, and signing out.
function Account({ username, passwordSet, onSignOut, onPasswordSet }: {
  username?: string;
  passwordSet: boolean;
  onSignOut?: () => void;
  onPasswordSet: () => void;
}) {
  return (
    <section className="card settings__section">
      <div className="settings__head">
        <h2>Your account</h2>
        {onSignOut && (
          <button className="settings__button settings__button--quiet" onClick={onSignOut}>
            Sign out
          </button>
        )}
      </div>
      <p className="settings__note">
        {passwordSet ? (
          <>
            Signed in{username ? <> as <b>{username}</b></> : null}. Signing in lasts 30 days on each browser.
          </>
        ) : (
          "No password yet: anyone who can open this computer's Looma address can use it. Set one to lock it."
        )}
      </p>
      <div className="settings__forms">
        {passwordSet && <NameForm username={username} onChanged={onPasswordSet} />}
        <PasswordForm passwordSet={passwordSet} onChanged={onPasswordSet} />
      </div>
      <p className="settings__note">
        Forgot the password? Run <code>looma password</code> in a terminal to set a new one.
      </p>
    </section>
  );
}

function NameForm({ username, onChanged }: { username?: string; onChanged: () => void }) {
  const [name, setName] = useState(username ?? "");
  const [current, setCurrent] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setName(username ?? ""), [username]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    api.setUsername(name.trim(), current).then(
      () => {
        setMessage({ ok: true, text: "Name saved. Sign in with it from now on." });
        setCurrent("");
        setBusy(false);
        onChanged();
      },
      (e: Error) => {
        setMessage({ ok: false, text: e.message });
        setBusy(false);
      },
    );
  };

  return (
    <form className="settings__form" onSubmit={submit}>
      <h3>Name</h3>
      <label>
        <span>Username</span>
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" maxLength={40} />
      </label>
      <label>
        <span>Current password</span>
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      </label>
      <div className="settings__form-end">
        <span />
        <button className="settings__button" disabled={busy || !current || !name.trim() || name.trim() === username}>
          {busy ? "Saving…" : "Save name"}
        </button>
      </div>
      {message && <p className={`settings__message${message.ok ? "" : " settings__message--error"}`}>{message.text}</p>}
    </form>
  );
}

function PasswordForm({ passwordSet, onChanged }: { passwordSet: boolean; onChanged: () => void }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const short = password.length > 0 && password.length < 8;
  const mismatch = again.length > 0 && password !== again;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (password !== again) return setMessage({ ok: false, text: "The two new passwords don't match." });
    setBusy(true);
    api.setPassword(passwordSet ? undefined : name.trim(), password, passwordSet ? current : undefined).then(
      () => {
        setMessage({ ok: true, text: passwordSet ? "Password changed. Other browsers are signed out." : "Password set. Looma now asks for it." });
        setCurrent("");
        setPassword("");
        setAgain("");
        setBusy(false);
        onChanged();
      },
      (e: Error) => {
        setMessage({ ok: false, text: e.message });
        setBusy(false);
      },
    );
  };

  return (
    <form className="settings__form" onSubmit={submit}>
      <h3>{passwordSet ? "Password" : "Set a password"}</h3>
      {!passwordSet && (
        <label>
          <span>Username</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" maxLength={40} />
        </label>
      )}
      {passwordSet && (
        <label>
          <span>Current password</span>
          <input type={show ? "text" : "password"} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </label>
      )}
      <label>
        <span>New password</span>
        <input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" aria-invalid={short} />
        {short && <em className="settings__hint">At least 8 characters.</em>}
      </label>
      <label>
        <span>New password again</span>
        <input type={show ? "text" : "password"} value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" aria-invalid={mismatch} />
        {mismatch && <em className="settings__hint">Doesn't match yet.</em>}
      </label>
      <div className="settings__form-end">
        <label className="settings__check">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show
        </label>
        <button className="settings__button" disabled={busy || short || mismatch || !password || !again || (passwordSet ? !current : !name.trim())}>
          {busy ? "Saving…" : passwordSet ? "Change password" : "Set password"}
        </button>
      </div>
      {message && <p className={`settings__message${message.ok ? "" : " settings__message--error"}`}>{message.text}</p>}
    </form>
  );
}

const EVENTS: [string, string][] = [
  ["user-prompt-submit", "A prompt started"],
  ["pre-tool-use", "An AI edit"],
  ["post-tool-use", "A shell command finished"],
  ["stop", "A prompt finished"],
  ["session-end", "A session ended"],
  ["post-commit", "A commit"],
];

// Whether the hooks that record AI changes have been called lately, and how many failed,
// so a prompt missing from AI changes can be told apart from one that failed to record.
function Recording() {
  const [health, setHealth] = useState<RecordingHealth | null>(null);
  useEffect(() => {
    api.recordingHealth().then(setHealth, () => {});
  }, []);
  if (!health) return null;
  return (
    <section className="card settings__section">
      <h2>Recording</h2>
      <p className="settings__note">
        When your AI tool and git last told Looma about something. A prompt only shows in AI changes if its tool
        ran Looma's hooks: Claude Code (terminal, editor extensions, the desktop app's Code tab), Codex and
        Antigravity do; plain chats and Cowork don't.
      </p>
      <ul className="settings__health">
        {EVENTS.map(([event, label]) => (
          <li key={event}>
            <span>{label}</span>
            <span className="settings__note">{health.last_call[event] ? new Date(health.last_call[event]).toLocaleString() : "never"}</span>
          </li>
        ))}
      </ul>
      {health.problems.length > 0 && (
        <div className="settings__message settings__message--error">
          {health.problems.map((problem) => (
            <p key={problem}>{problem}</p>
          ))}
          {health.repairable && <button
            className="settings__button"
            onClick={() => api.repairRecording().then(setHealth, (e: Error) => setHealth({ ...health, problems: [e.message] }))}
          >
            Repair the hooks
          </button>}
        </div>
      )}
      {health.errors > 0 ? (
        <p className="settings__message settings__message--error">
          {health.errors} hook error{health.errors === 1 ? "" : "s"} in the last {health.days} days
          {health.last_error && (
            <>
              , the latest {new Date(health.last_error.at).toLocaleString()} ({health.last_error.event}): {health.last_error.detail}
            </>
          )}
          . Details in <code>{health.error_log}</code>.
        </p>
      ) : (
        <p className="settings__note">No hook errors in the last {health.days} days. Every call is listed in <code>{health.hook_log}</code>.</p>
      )}
    </section>
  );
}

// Where clones go, remembered in this browser.
const CLONE_FOLDER = "looma:clone-folder";

function savedCloneFolder(): string {
  try {
    return localStorage.getItem(CLONE_FOLDER) || "~/Projects";
  } catch {
    return "~/Projects";
  }
}

// Your GitHub account, connected with GitHub's device sign-in: Looma shows a code, you
// enter it on github.com. Then your repositories, to clone one as a project.
function GitHub({ onCloned }: { onCloned?: (repo: Repo) => void }) {
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [token, setToken] = useState("");
  const [pasting, setPasting] = useState(false);

  const reload = useCallback(() => {
    api.github().then(setStatus, (e: Error) => setError(e.message));
  }, []);
  useEffect(reload, [reload]);

  // While a code is on screen, ask every five seconds whether it was entered (the backend
  // asks GitHub no more often than GitHub allows).
  const waiting = !!status?.code && !status.connected;
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => {
      api.githubPoll().then(setStatus, (e: Error) => {
        setError(e.message);
        api.github().then(setStatus, () => {});
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [waiting]);

  const connect = (method: "app" | "gh") => {
    setBusy(true);
    setError(null);
    setCopied(false);
    api.githubConnect(method).then(
      (found) => (setStatus(found), setBusy(false)),
      (e: Error) => (setError(e.message), setBusy(false)),
    );
  };

  const submitToken = (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    api.githubToken(token).then(
      (found) => (setStatus(found), setToken(""), setPasting(false), setBusy(false)),
      (e: Error) => (setError(e.message), setBusy(false)),
    );
  };

  const disconnect = () => {
    setBusy(true);
    api.githubDisconnect().then(
      (found) => (setStatus(found), setBusy(false)),
      (e: Error) => (setError(e.message), setBusy(false)),
    );
  };

  const copy = () => {
    if (!status?.code) return;
    navigator.clipboard?.writeText(status.code).then(() => setCopied(true), () => {});
  };

  if (!status) {
    return (
      <section className="card settings__section">
        <h2>GitHub</h2>
        {error ? <p className="settings__message settings__message--error">{error}</p> : <p className="settings__note">Checking…</p>}
      </section>
    );
  }

  return (
    <>
      <section className="card settings__section">
        <div className="settings__head">
          <span className="ai-page__title">
            <BrandLogo brand="github" size={20} tile />
            <h2>GitHub</h2>
          </span>
          {status.connected && (
            <button className="settings__button settings__button--quiet" onClick={disconnect} disabled={busy}>
              Disconnect
            </button>
          )}
        </div>
        {status.connected ? (
          <>
            <div className="github__account">
              {status.avatar && <img src={status.avatar} alt="" width={40} height={40} />}
              <div>
                <strong>{status.name || status.login}</strong>
                <span className="settings__note">
                  Connected as @{status.login}
                  {status.via === "gh" ? " through the gh tool" : status.via === "token" ? " with a token you pasted" : ""}
                </span>
              </div>
            </div>
            <p className="settings__note">{CONNECTED_NOTE[status.via ?? "app"]}</p>
          </>
        ) : status.code ? (
          <div className="github__code">
            <p className="settings__note">Enter this code on the GitHub page that opened. Looma connects as soon as you have.</p>
            <div className="github__code-row">
              <code aria-label="Your code">{status.code}</code>
              <button className="settings__button settings__button--quiet" onClick={copy}>
                {copied ? "Copied" : "Copy"}
              </button>
              <a className="settings__button" href={status.verify_url ?? "https://github.com/login/device"} target="_blank" rel="noreferrer">
                Open GitHub
              </a>
            </div>
            <p className="settings__note">Waiting for GitHub… The code works for 15 minutes.</p>
            <div>
              <button className="settings__button settings__button--quiet" onClick={disconnect} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="settings__note">
              Sign in to see your repositories here, clone one as a project in a click, and see each project's open pull
              requests. Your password never passes through Looma: you sign in on GitHub's own page.
            </p>
            {(status.configured || status.gh) && (
              <div className="github__signin">
                <button className="github__signin-button" onClick={() => connect(status.configured ? "app" : "gh")} disabled={busy}>
                  <GitHubMark />
                  {busy ? "Opening GitHub…" : "Sign in with GitHub"}
                </button>
                {status.configured && status.gh && (
                  <button className="github__alt" onClick={() => connect("gh")} disabled={busy}>
                    Use the gh tool's sign-in instead
                  </button>
                )}
              </div>
            )}
            {!status.configured && !status.gh && (
              <p className="settings__note">
                For one-click sign-in, install GitHub's <a href="https://cli.github.com" target="_blank" rel="noreferrer">gh tool</a>{" "}
                and come back. Or paste a token below.
              </p>
            )}
            {pasting || (!status.configured && !status.gh) ? (
              <form className="github__token" onSubmit={submitToken}>
                <label>
                  <span>
                    Token from{" "}
                    <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
                      GitHub → Settings → Fine-grained tokens
                    </a>
                    . Give it read-only Contents and Pull requests.
                  </span>
                  <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_…" autoComplete="off" spellCheck={false} />
                </label>
                <div className="github__token-actions">
                  <button className="settings__button" type="submit" disabled={busy || !token.trim()}>
                    {busy ? "Checking…" : "Connect"}
                  </button>
                  {/* Back to signing in on GitHub's page, when that's possible here. */}
                  {(status.configured || status.gh) && (
                    <button type="button" className="settings__button settings__button--quiet"
                            onClick={() => (setPasting(false), setToken(""), setError(null))} disabled={busy}>
                      Back
                    </button>
                  )}
                </div>
              </form>
            ) : (
              <button className="github__alt" onClick={() => setPasting(true)}>
                Paste a token instead
              </button>
            )}
          </>
        )}
        {error && <p className="settings__message settings__message--error">{error}</p>}
      </section>
      {status.connected && <GitHubRepos installUrl={status.via === "app" ? status.install_url : null} onCloned={onCloned} onSignedOut={reload} />}
    </>
  );
}

// What Looma can see, for each way of connecting.
const CONNECTED_NOTE: Record<NonNullable<GitHubStatus["via"]>, string> = {
  app: "Looma can read only the repositories you installed its app on, and can't change anything there. To stop it reading them, disconnect here and revoke Looma under GitHub → Settings → Applications.",
  gh: "Looma borrows the gh tool's sign-in, which can see every repository your account can and also change them. Looma only reads. Disconnecting here leaves gh signed in; run gh auth logout to sign it out.",
  token: "Looma can do what the token allows, and keeps it only on this computer. Disconnecting forgets it here; delete it on GitHub to end it everywhere.",
};

function GitHubMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function GitHubRepos({ installUrl, onCloned, onSignedOut }: { installUrl: string | null; onCloned?: (repo: Repo) => void; onSignedOut: () => void }) {
  const [repos, setRepos] = useState<GitHubRepo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [folder, setFolder] = useState(savedCloneFolder);
  const [cloning, setCloning] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(() => {
    setError(null);
    api.githubRepos().then(setRepos, (e: unknown) => {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status === 409) onSignedOut();
    });
  }, [onSignedOut]);
  useEffect(load, [load]);

  const clone = (repo: GitHubRepo) => {
    setCloning(repo.full_name);
    setError(null);
    try {
      localStorage.setItem(CLONE_FOLDER, folder);
    } catch {
      /* storage unavailable */
    }
    api.githubClone(repo.full_name, folder).then(
      (made) => {
        setCloning(null);
        setRepos((list) => list?.map((r) => (r.full_name === repo.full_name ? { ...r, tracked: made.path } : r)) ?? null);
        onCloned?.(made);
      },
      (e: Error) => (setError(e.message), setCloning(null)),
    );
  };

  const shown = (repos ?? []).filter((r) => r.full_name.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <section className="card settings__section">
      <div className="settings__head">
        <h2>Your repositories</h2>
        <div className="github__actions">
          {installUrl && (
            <a className="settings__button settings__button--quiet" href={installUrl} target="_blank" rel="noreferrer">
              Pick repositories
            </a>
          )}
          <button className="settings__button settings__button--quiet" onClick={load}>
            Refresh
          </button>
        </div>
      </div>
      <div className="github__fields">
        <label>
          <span>Clone into</span>
          <input value={folder} onChange={(e) => setFolder(e.target.value)} spellCheck={false} />
        </label>
        {(repos?.length ?? 0) > 6 && (
          <label>
            <span>Find</span>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="owner/name" spellCheck={false} />
          </label>
        )}
      </div>
      {error && <p className="settings__message settings__message--error">{error}</p>}
      {repos === null && !error && <p className="settings__note">Asking GitHub…</p>}
      {repos?.length === 0 && (
        <p className="settings__note">
          Looma's app isn't installed on any repository yet. Press Pick repositories, choose some on GitHub, then Refresh.
        </p>
      )}
      {shown.length > 0 && (
        <ul className="github__repos">
          {shown.map((repo) => (
            <li key={repo.full_name}>
              <div className="github__repo">
                <a href={repo.url ?? undefined} target="_blank" rel="noreferrer">
                  {repo.full_name}
                </a>
                {repo.private && <span className="github__badge">Private</span>}
                {repo.description && <span className="settings__note">{repo.description}</span>}
              </div>
              {repo.tracked ? (
                <span className="github__tracked" title={repo.tracked}>
                  A project here
                </span>
              ) : (
                <button className="settings__button" onClick={() => clone(repo)} disabled={cloning !== null || !folder.trim()}>
                  {cloning === repo.full_name ? "Cloning…" : "Clone"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Your AWS CodeCommit repositories, through one of this computer's AWS profiles: Looma asks
// the AWS CLI to sign each request with it and keeps no keys. Then the region's repositories,
// to clone one as a project.
function CodeCommit({ onCloned }: { onCloned?: (repo: Repo) => void }) {
  const [status, setStatus] = useState<CodeCommitStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState("");
  const [region, setRegion] = useState("");

  const reload = useCallback(() => {
    api.codecommit().then(
      (found) => {
        setStatus(found);
        // Start from the connected profile, else the default one, with the region it's set to.
        const picked = found.profiles.find((p) => p.name === found.profile) ?? found.profiles[0];
        setProfile((now) => now || picked?.name || "");
        setRegion((now) => now || found.region || picked?.region || "");
      },
      (e: Error) => setError(e.message),
    );
  }, []);
  useEffect(reload, [reload]);

  const pick = (name: string) => {
    setProfile(name);
    const set = status?.profiles.find((p) => p.name === name)?.region;
    if (set) setRegion(set);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    api.codecommitConnect(profile, region).then(
      (found) => (setStatus(found), setBusy(false)),
      (e: Error) => (setError(e.message), setBusy(false)),
    );
  };

  const disconnect = () => {
    setBusy(true);
    api.codecommitDisconnect().then(
      (found) => (setStatus(found), setBusy(false)),
      (e: Error) => (setError(e.message), setBusy(false)),
    );
  };

  if (!status) {
    return (
      <section className="card settings__section">
        <h2>CodeCommit</h2>
        {error ? <p className="settings__message settings__message--error">{error}</p> : <p className="settings__note">Checking…</p>}
      </section>
    );
  }

  const form = (
    <form className="github__token" onSubmit={submit}>
      <label>
        <span>AWS profile</span>
        {status.profiles.length > 0 ? (
          <select className="select" value={profile} onChange={(e) => pick(e.target.value)}>
            {status.profiles.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
                {p.region ? ` (${p.region})` : ""}
              </option>
            ))}
          </select>
        ) : (
          <input value={profile} onChange={(e) => setProfile(e.target.value)} placeholder="default" spellCheck={false} />
        )}
      </label>
      <label>
        <span>Region</span>
        <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="us-east-1" spellCheck={false} />
      </label>
      <button className="settings__button" type="submit" disabled={busy || !profile.trim() || !region.trim()}>
        {busy ? "Checking…" : status.connected ? "Switch" : "Connect"}
      </button>
    </form>
  );

  return (
    <>
      <section className="card settings__section">
        <div className="settings__head">
          <span className="ai-page__title">
            <BrandLogo brand="codecommit" size={20} tile />
            <h2>CodeCommit</h2>
          </span>
          {status.connected && (
            <button className="settings__button settings__button--quiet" onClick={disconnect} disabled={busy}>
              Disconnect
            </button>
          )}
        </div>
        {!status.cli ? (
          <p className="settings__note">
            Looma reads CodeCommit through the{" "}
            <a href="https://aws.amazon.com/cli/" target="_blank" rel="noreferrer">
              AWS CLI
            </a>
            , which isn't installed on this computer. Install it, run <code>aws configure</code> (or{" "}
            <code>aws configure sso</code>), then come back.
          </p>
        ) : status.connected ? (
          <>
            <div className="github__account">
              <div>
                <strong>{status.arn?.split(/[:/]/).pop() ?? status.profile}</strong>
                <span className="settings__note">
                  Connected with the {status.profile} profile in {status.region}
                  {status.account ? `, account ${status.account}` : ""}
                </span>
              </div>
            </div>
            <p className="settings__note">
              Looma keeps no AWS keys: it asks the AWS CLI to sign each request with this profile, so it can do what the
              profile's IAM permissions allow, and only reads. Clones are set up to sign git with the same profile.
            </p>
            <details className="codecommit__switch">
              <summary>Use another profile or region</summary>
              {form}
            </details>
          </>
        ) : (
          <>
            <p className="settings__note">
              Pick one of your AWS profiles to see your CodeCommit repositories here, clone one as a project in a click, and
              see each project's open pull requests. Looma keeps no keys: it uses the profile the way the AWS CLI does.
            </p>
            {status.profiles.length === 0 && (
              <p className="settings__note">
                No AWS profiles found on this computer. Run <code>aws configure</code> in a terminal first, or type a
                profile's name.
              </p>
            )}
            {form}
          </>
        )}
        {error && <p className="settings__message settings__message--error">{error}</p>}
      </section>
      {status.connected && <CodeCommitRepos key={`${status.profile}/${status.region}`} region={status.region ?? ""} onCloned={onCloned} onSignedOut={reload} />}
    </>
  );
}

function CodeCommitRepos({ region, onCloned, onSignedOut }: { region: string; onCloned?: (repo: Repo) => void; onSignedOut: () => void }) {
  const [repos, setRepos] = useState<CodeCommitRepo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [folder, setFolder] = useState(savedCloneFolder);
  const [cloning, setCloning] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(() => {
    setError(null);
    api.codecommitRepos().then(setRepos, (e: unknown) => {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status === 409) onSignedOut();
    });
  }, [onSignedOut]);
  useEffect(load, [load]);

  const clone = (repo: CodeCommitRepo) => {
    setCloning(repo.name);
    setError(null);
    try {
      localStorage.setItem(CLONE_FOLDER, folder);
    } catch {
      /* storage unavailable */
    }
    api.codecommitClone(repo.name, folder).then(
      (made) => {
        setCloning(null);
        setRepos((list) => list?.map((r) => (r.name === repo.name ? { ...r, tracked: made.path } : r)) ?? null);
        onCloned?.(made);
      },
      (e: Error) => (setError(e.message), setCloning(null)),
    );
  };

  const shown = (repos ?? []).filter((r) => r.name.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <section className="card settings__section">
      <div className="settings__head">
        <h2>Repositories in {region}</h2>
        <div className="github__actions">
          <button className="settings__button settings__button--quiet" onClick={load}>
            Refresh
          </button>
        </div>
      </div>
      <div className="github__fields">
        <label>
          <span>Clone into</span>
          <input value={folder} onChange={(e) => setFolder(e.target.value)} spellCheck={false} />
        </label>
        {(repos?.length ?? 0) > 6 && (
          <label>
            <span>Find</span>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="name" spellCheck={false} />
          </label>
        )}
      </div>
      {error && <p className="settings__message settings__message--error">{error}</p>}
      {repos === null && !error && <p className="settings__note">Asking CodeCommit…</p>}
      {repos?.length === 0 && (
        <p className="settings__note">
          No repositories in {region}. CodeCommit keeps each region's repositories apart: if yours are elsewhere, switch the
          region above.
        </p>
      )}
      {shown.length > 0 && (
        <ul className="github__repos">
          {shown.map((repo) => (
            <li key={repo.name}>
              <div className="github__repo">
                <a href={repo.url ?? undefined} target="_blank" rel="noreferrer">
                  {repo.name}
                </a>
                {repo.description && <span className="settings__note">{repo.description}</span>}
              </div>
              {repo.tracked ? (
                <span className="github__tracked" title={repo.tracked}>
                  A project here
                </span>
              ) : (
                <button className="settings__button" onClick={() => clone(repo)} disabled={cloning !== null || !folder.trim()}>
                  {cloning === repo.name ? "Cloning…" : "Clone"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Shortcuts({ prefs, onPrefs, onReset }: { prefs: Preferences; onPrefs: Props["onPrefs"]; onReset: () => Promise<void> }) {
  // The action waiting for its new key, if any.
  const [listening, setListening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!listening) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") return setListening(null);
      // Backspace or Delete turns the shortcut off.
      const key = event.key === "Backspace" || event.key === "Delete" ? "" : keyName(event);
      if (key === null) return setError("That key can't be a shortcut. Try a letter, a number or a function key.");
      const action = listening;
      setListening(null);
      onPrefs({ shortcuts: { [action]: key } }).then(
        () => setError(null),
        (e: Error) => setError(e.message),
      );
    };
    // Capture, so the key isn't also taken as a shortcut while choosing it.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening, onPrefs]);

  const groups = [...new Set(SHORTCUTS.map((s) => s.group))];
  return (
    <section className="card settings__section settings__keys">
      <div className="settings__head">
        <h2>Shortcut keys</h2>
        <button className="settings__button settings__button--quiet" onClick={() => onReset().then(() => setError(null))}>
          Reset to defaults
        </button>
      </div>
      <p className="settings__note">
        Click a key to change it, then press the new one. Backspace turns a shortcut off, Esc keeps the old key. Shortcuts
        don't fire while you're typing in a box.
      </p>
      {error && <p className="settings__message settings__message--error">{error}</p>}
      <div className="settings__groups">
        {groups.map((group) => (
          <div key={group} className="settings__group">
            <h3>{group}</h3>
            <ul>
              {SHORTCUTS.filter((s) => s.group === group).map((s) => {
                const key = prefs.shortcuts[s.id];
                return (
                  <li key={s.id}>
                    <span>{s.label}</span>
                    <button
                      className={`settings__key${listening === s.id ? " settings__key--listening" : ""}${key ? "" : " settings__key--off"}`}
                      onClick={() => setListening(listening === s.id ? null : s.id)}
                      aria-label={`${s.label}: ${key ? keyLabel(key) : "no shortcut"}. Change`}
                    >
                      {listening === s.id ? "Press a key…" : key ? <kbd>{keyLabel(key)}</kbd> : "None"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <div className="settings__group">
          <h3>Always</h3>
          <ul>
            {FIXED.map((f) => (
              <li key={f.label}>
                <span>{f.label}</span>
                <span className="settings__key settings__key--fixed">
                  <kbd>{f.keys}</kbd>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
