import { useState, type KeyboardEvent } from "react";
import { api } from "../../api/client";
import { LightTile } from "../Splash/LoomaTile";
import "./Login.css";

// The sign-in form, shown in the panel that slides in over the splash. The first time, it
// asks for a username and a new password instead, with how strong the password is and
// whether the two match. The splash plays the bang once it's right.

type Props = {
  // No password yet: ask for a username and a new password instead.
  setup: boolean;
  // Signed in: the splash carries on into the dashboard.
  onSignedIn: () => void;
};

const MIN_LENGTH = 8;

// 0-4: too short, weak, fair, good, strong. Length counts most, then mixing kinds of character.
function strength(password: string): number {
  if (password.length < MIN_LENGTH) return 0;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((kind) => kind.test(password)).length;
  return Math.min(4, 1 + (password.length >= 12 ? 1 : 0) + (kinds >= 3 ? 1 : 0) + (password.length >= 16 || kinds === 4 ? 1 : 0));
}
const STRENGTH = ["Too short", "Weak", "Fair", "Good", "Strong"];

export default function Login({ setup, onSignedIn }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped on each failure, so the error shakes again.
  const [tries, setTries] = useState(0);

  const score = strength(password);
  const matches = !setup || (again.length > 0 && again === password);
  const ready = username.trim() && password && (!setup || (password.length >= MIN_LENGTH && matches));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (setup && password !== again) {
      setError("The two passwords don't match.");
      setTries((n) => n + 1);
      return;
    }
    setBusy(true);
    setError(null);
    (setup ? api.setPassword(username.trim(), password) : api.logIn(username.trim(), password)).then(
      () => {
        setDone(true);
        onSignedIn();
      },
      (e: Error) => {
        setError(e.message);
        setTries((n) => n + 1);
        setBusy(false);
      },
    );
  };

  const watchCaps = (event: KeyboardEvent<HTMLInputElement>) => setCaps(event.getModifierState?.("CapsLock") ?? false);

  return (
    <form className={`login${done ? " login--done" : ""}`} onSubmit={submit}>
      <header className="login__head">
        <LightTile className="login__tile" weight={2.2} />
        <span className="login__step">{setup ? "First time here" : "Looma"}</span>
      </header>
      <div>
        <h1>{setup ? "Make your account" : "Welcome back"}</h1>
        <p className="login__lead">
          {setup
            ? "Only you will be able to open this dashboard. Pick a username and a password of at least 8 characters."
            : "Sign in to open your dashboard."}
        </p>
      </div>

      <label className="login__field">
        <span>Username</span>
        <div className="login__input">
          <svg className="login__icon" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="7" r="3.2" />
            <path d="M3.8 16.5c.9-3 3.3-4.6 6.2-4.6s5.3 1.6 6.2 4.6" />
          </svg>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={40}
            disabled={done}
            placeholder={setup ? "Pick a name" : "Your username"}
          />
        </div>
      </label>

      <label className="login__field">
        <span>{setup ? "New password" : "Password"}</span>
        <div className="login__input">
          <svg className="login__icon" viewBox="0 0 20 20" aria-hidden="true">
            <rect x="4" y="9" width="12" height="8" rx="2" />
            <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
          </svg>
          <input
            type={show ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyUp={watchCaps}
            onKeyDown={watchCaps}
            autoComplete={setup ? "new-password" : "current-password"}
            disabled={done}
            placeholder={setup ? "At least 8 characters" : "Your password"}
          />
          <button
            type="button"
            className="login__show"
            onClick={() => setShow((v) => !v)}
            aria-pressed={show}
            aria-label={show ? "Hide the password" : "Show the password"}
            title={show ? "Hide" : "Show"}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M1.8 10S4.8 4.5 10 4.5 18.2 10 18.2 10 15.2 15.5 10 15.5 1.8 10 1.8 10Z" />
              <circle cx="10" cy="10" r="2.6" />
              {show && <path d="M3 3l14 14" />}
            </svg>
          </button>
        </div>
        {caps && <em className="login__caps">Caps Lock is on</em>}
        {setup && password && (
          <div className={`login__strength login__strength--${score}`} aria-live="polite">
            <div aria-hidden="true">
              {[1, 2, 3, 4].map((n) => (
                <i key={n} className={n <= score ? "is-on" : ""} />
              ))}
            </div>
            <span>{STRENGTH[score]}</span>
          </div>
        )}
      </label>

      {setup && (
        <label className="login__field">
          <span>Type it again</span>
          <div className={`login__input${again && !matches ? " login__input--bad" : ""}${matches && again ? " login__input--good" : ""}`}>
            <svg className="login__icon" viewBox="0 0 20 20" aria-hidden="true">
              {matches && again ? <path d="M5 10.5l3.2 3.2L15 7" /> : <><rect x="4" y="9" width="12" height="8" rx="2" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></>}
            </svg>
            <input
              type={show ? "text" : "password"}
              value={again}
              onChange={(event) => setAgain(event.target.value)}
              onKeyUp={watchCaps}
              autoComplete="new-password"
              disabled={done}
              placeholder="The same password"
            />
          </div>
          {again && !matches && <em className="login__caps">Doesn't match yet</em>}
        </label>
      )}

      {error && (
        <p key={tries} className="login__error" role="alert">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="7.5" />
            <path d="M10 6v4.5M10 13.6v.1" />
          </svg>
          {error}
        </p>
      )}

      <button className="login__submit" disabled={busy || !ready}>
        {busy && <span className="login__spinner" aria-hidden="true" />}
        {busy ? (setup ? "Saving…" : "Checking…") : setup ? "Create and enter" : "Sign in"}
        {!busy && (
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M4 10h11M11 5.5 15.5 10 11 14.5" />
          </svg>
        )}
      </button>

      <ul className="login__trust">
        <li>Stays on this computer</li>
        <li>No cloud account</li>
        <li>Signed in for 30 days</li>
      </ul>
      <p className="login__hint">
        {setup ? "Forget it later? " : "Forgot it? "}
        Run <code>looma password</code> in a terminal to set a new one.
      </p>
    </form>
  );
}
