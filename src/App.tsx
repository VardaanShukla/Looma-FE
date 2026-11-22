import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, ApiError, SIGNED_OUT } from "./api/client";
import type { AiStatus, AuthStatus, Branches, Comparison, FileExplanation, Flow, KnowledgeTransfer, PreferenceChange, Preferences, ProjectMap as MapData, Repo, Summary as SummaryData, Sync } from "./api/types";
import AddProject from "./components/AddProject/AddProject";
import Digest, { NOT_RECORDING } from "./components/Digest/Digest";
import CommitList from "./components/CommitList/CommitList";
import PullRequests from "./components/PullRequests/PullRequests";
import FileChanges from "./components/FileChanges/FileChanges";
import FlowGraph from "./components/FlowGraph/FlowGraph";
import Help, { useSetup } from "./components/Help/Help";
import Tour from "./components/Tour/Tour";
import Home from "./components/Home/Home";
import Loading from "./components/Loading/Loading";
import Login from "./components/Login/Login";
import Logo from "./components/Logo/Logo";
import Overview, { branchNote } from "./components/Overview/Overview";
import ProjectMap from "./components/ProjectMap/ProjectMap";
import ProjectPanel from "./components/ProjectPanel/ProjectPanel";
import RemoveProject from "./components/RemoveProject/RemoveProject";
import SideMenu, { ProjectPicker, SETTINGS_SECTIONS, VIEWS, settingsSectionLabel, type SettingsSection, type View } from "./components/SideMenu/SideMenu";
import Sidebar from "./components/Sidebar/Sidebar";
import ClaudeSetup from "./components/ClaudeSignIn/ClaudeSetup";
import Settings, { AiPicker } from "./components/Settings/Settings";
import Summary from "./components/Summary/Summary";
import Ask from "./components/Ask/Ask";
import Splash from "./components/Splash/Splash";
import { keyName, typing } from "./shortcuts";
import { clear, job, result, start, useJobs } from "./lib/aiJobs";
import "./App.css";

type Theme = "light" | "dark";

// The view in the address bar (#changes), so a refresh or a shared link keeps it.
function viewFromHash(): View {
  const id = window.location.hash.slice(1).split("/")[0];
  return VIEWS.some((item) => item.id === id) ? (id as View) : "home";
}

// The part of Settings after it (#settings/ai/ollama); General when there's none.
function sectionFromHash(): SettingsSection {
  const [view, ...rest] = window.location.hash.slice(1).split("/");
  const id = rest.join("/");
  const known = SETTINGS_SECTIONS.some((part) => part.id === id || part.children?.some((child) => child.id === id));
  return view === "settings" && known ? (id as SettingsSection) : "general";
}

// Remembered per browser; a blocked storage just means the default each time.
function savedTheme(): Theme {
  try {
    const value = localStorage.getItem("looma-theme");
    if (value === "light" || value === "dark") return value;
  } catch {
    /* storage unavailable */
  }
  // The dashboard is designed dark first.
  return "dark";
}

// The splash, with the sign-in panel sliding in once its globe has formed when a password is
// set (or the first time, to set one), then the dashboard.
export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  // Bumped on signing out, to play the splash again with the sign-in panel.
  const [round, setRound] = useState(0);

  // Before the first paint, so the splash starts in the right theme.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = savedTheme();
  }, []);

  useEffect(() => {
    // When the backend can't be reached, the dashboard says so.
    api.auth().then(setAuth, () => setAuth({ password_set: true, signed_in: true }));
    const signedOut = () => {
      setAuth({ password_set: true, signed_in: false });
      setSplashDone(false);
      setRound((n) => n + 1);
    };
    window.addEventListener(SIGNED_OUT, signedOut);
    return () => window.removeEventListener(SIGNED_OUT, signedOut);
  }, []);

  const signOut = () => api.logOut().finally(() => window.dispatchEvent(new Event(SIGNED_OUT)));
  // The dashboard loads under the splash once signed in, and shows as the splash fades.
  return (
    <>
      {auth?.signed_in && (
        <Dashboard
          auth={auth}
          shown={splashDone}
          onSignOut={auth.password_set ? signOut : undefined}
          onAuthChange={() => api.auth().then(setAuth).catch(() => {})}
        />
      )}
      {!splashDone && (
        <Splash
          key={round}
          hold={auth ? !auth.signed_in : null}
          panel={
            auth &&
            !auth.signed_in && (
              <Login
                setup={!auth.password_set}
                onSignedIn={() => api.auth().then(setAuth, () => setAuth({ password_set: true, signed_in: true }))}
              />
            )
          }
          onDone={() => setSplashDone(true)}
        />
      )}
    </>
  );
}

// shown: the splash has gone, so a walkthrough can start.
function Dashboard({ auth, shown, onSignOut, onAuthChange }: { auth: AuthStatus; shown: boolean; onSignOut?: () => void; onAuthChange: () => void }) {
  const [view, setView] = useState<View>(viewFromHash);
  const [section, setSection] = useState<SettingsSection>(sectionFromHash);
  const [theme, setTheme] = useState<Theme>(savedTheme);
  // Settings from the backend: theme, uncommitted work from the start, shortcut keys.
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [repoId, setRepoId] = useState<number | null>(null);
  const [branches, setBranches] = useState<Branches | null>(null);
  const [head, setHead] = useState<string | null>(null);
  // Only set when the project has no usual base branch and the user picked one.
  const [base, setBase] = useState<string | null>(null);
  const [uncommitted, setUncommitted] = useState(false);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [map, setMap] = useState<MapData | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  // Every file's note from the knowledge transfer, shown above the file in Changes.
  const [kt, setKt] = useState<KnowledgeTransfer | null>(null);
  // The prompt open in AI changes, kept here so coming back to the page finds it open.
  const [openChange, setOpenChange] = useState<{ id: string; focus: string | null } | null>(null);
  // Explanations run outside the screens (lib/aiJobs); this re-renders when one finishes.
  useJobs();
  // Whether Claude Code is installed and signed in, to explain functions and the project.
  const [ai, setAi] = useState<AiStatus | null>(null);
  const refreshAi = useCallback(() => {
    api.ai().then(setAi).catch(() => setAi(null));
  }, []);
  // Claude Code answers 424 when its sign-in has run out: offer signing in instead.
  const watchSignIn = useCallback(<T,>(promise: Promise<T>) =>
    promise.catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 424) setAi((current) => current && { ...current, signed_in: false });
      throw e;
    }), []);
  // A file to show in What changed, picked from the project map; count re-picks the same.
  const [focus, setFocus] = useState<{ path: string; count: number } | null>(null);
  // The screen a file was opened from, so the breadcrumb leads back to it from Changes.
  const [openedFrom, setOpenedFrom] = useState<View | null>(null);
  // What the screen on show has picked (a file, a part), as the breadcrumb's last step.
  const [picked, setPicked] = useState<{ view: View; label: string } | null>(null);
  const pickMap = useCallback((label: string | null) => setPicked(label ? { view: "map", label } : null), []);
  const pickChanges = useCallback((label: string | null) => setPicked(label ? { view: "changes", label } : null), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Repo | null>(null);
  // Bumped whenever git changes underneath the page, to reload without a refresh.
  const [revision, setRevision] = useState(0);
  const branchesRef = useRef<Branches | null>(null);
  const [sync, setSync] = useState<(Sync & { running: boolean }) | null>(null);
  const syncNow = useRef<() => void>(() => {});
  branchesRef.current = branches;
  // A folder that isn't a git repository: no branches, commits or compare, only its files.
  const noGit = repos?.find((item) => item.id === repoId)?.git === false;
  // Said once a project is added with something turned off, such as one without git.
  const [addedNote, setAddedNote] = useState<string | null>(null);

  // Everything shown belongs to one project, so switching clears it in the same render;
  // otherwise one request would go out with the old project's branch names.
  const selectRepo = (id: number | null) => {
    setRepoId(id);
    setBranches(null);
    setHead(null);
    setBase(null);
    setComparison(null);
    setFlow(null);
    setMap(null);
    setSummary(null);
    setKt(null);
    setError(null);
  };

  // Each screen opened is a step in the browser's history, so its Back button (and a mouse's
  // back button) returns to the screen before; the first one only names where the page opened.
  // Each step remembers the screen it was opened from, for the breadcrumb's back arrow.
  const firstScreen = useRef(true);
  const [cameFrom, setCameFrom] = useState<string | null>(null);
  useEffect(() => {
    const wanted = view === "settings" ? `settings/${section}` : view;
    const here = window.location.hash.slice(1);
    if (here !== wanted) {
      if (firstScreen.current) {
        history.replaceState(null, "", `#${wanted}`);
      } else {
        history.pushState({ from: here }, "", `#${wanted}`);
        setCameFrom(here);
      }
    }
    firstScreen.current = false;
    const onHash = () => {
      setView(viewFromHash());
      setSection(sectionFromHash());
      setCameFrom((history.state as { from?: string } | null)?.from ?? null);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [view, section]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("looma-theme", theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);

  // The saved settings decide the theme and whether uncommitted work shows from the start.
  // Until they arrive the browser's last theme stays, so the page doesn't flash.
  useEffect(() => {
    api.preferences().then(
      (saved) => {
        setPrefs(saved);
        setTheme(saved.theme);
        if (saved.uncommitted) setUncommitted(true);
      },
      () => {},
    );
  }, []);
  const changePrefs = useCallback(
    (changes: PreferenceChange) =>
      api.setPreferences(changes).then((saved) => {
        setPrefs(saved);
        // Settings is where uncommitted work is turned on or off, so it applies at once.
        if (changes.uncommitted !== undefined) setUncommitted(saved.uncommitted === true);
        setTheme(saved.theme);
      }),
    [],
  );
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    changePrefs({ theme: next }).catch(() => {});
  };

  useEffect(() => {
    api
      .repos()
      .then((list) => {
        setRepos(list);
        selectRepo(list.find((repo) => repo.exists)?.id ?? null);
      })
      .catch((e: ApiError) => setError(e.message));
  }, []);


  useEffect(() => {
    if (repoId === null) return;
    // Without git there are no branches: the files are read as they are in the folder.
    if (noGit) {
      setBranches(null);
      setHead("HEAD");
      return;
    }
    let stale = false;
    api
      .branches(repoId)
      .then((result) => {
        if (stale) return;
        const previous = branchesRef.current;
        setBranches(result);
        // Follow a checkout when the page was showing the checked-out branch, and fall
        // back to it when the shown branch was deleted; otherwise keep the user's pick.
        setHead((shown) =>
          shown === null || shown === previous?.current || !result.branches.includes(shown)
            ? result.current ?? result.branches[0] ?? null
            : shown,
        );
      })
      .catch((e: ApiError) => !stale && setError(e.message));
    return () => {
      stale = true;
    };
  }, [repoId, revision, noGit]);

  // Merged and deleted branches are listed for a while, then dropped: reload when the
  // first of them is due to go.
  useEffect(() => {
    const due = (branches?.details ?? [])
      .filter((branch) => branch.removes_at && branch.name !== branches?.current)
      .map((branch) => Date.parse(branch.removes_at!));
    if (due.length === 0) return;
    const timer = window.setTimeout(() => setRevision((n) => n + 1), Math.max(0, Math.min(...due) - Date.now()) + 1000);
    return () => window.clearTimeout(timer);
  }, [branches]);

  // The branch flow: reloaded with everything else when git changes.
  useEffect(() => {
    if (repoId === null) return;
    if (noGit) {
      setFlow(null);
      return;
    }
    let stale = false;
    api
      .flow(repoId)
      .then((result) => !stale && setFlow(result))
      .catch(() => !stale && setFlow(null));
    return () => {
      stale = true;
    };
  }, [repoId, revision, noGit]);

  // The project map for the branch on screen, from its committed files.
  useEffect(() => {
    if (repoId === null || head === null) return;
    let stale = false;
    api
      .map(repoId, head)
      .then((result) => !stale && setMap(result))
      .catch(() => !stale && setMap(null));
    return () => {
      stale = true;
    };
  }, [repoId, head, revision]);

  // The project summary for the branch on screen.
  useEffect(() => {
    if (repoId === null || head === null) return;
    let stale = false;
    api
      .summary(repoId, head)
      .then((result) => !stale && setSummary(result))
      .catch(() => !stale && setSummary(null));
    return () => {
      stale = true;
    };
  }, [repoId, head, revision]);

  // The file notes, read when Changes is on screen: cheap, since they are only read from disk.
  useEffect(() => {
    if (view !== "changes" || repoId === null || head === null) return;
    let stale = false;
    api
      .kt(repoId, head)
      .then((result) => !stale && setKt(result))
      .catch(() => !stale && setKt(null));
    return () => {
      stale = true;
    };
  }, [view, repoId, head, revision]);

  useEffect(refreshAi, [refreshAi]);

  // Fetch from GitHub now and then, so merges and branches deleted there show up here.
  // Only remote-tracking refs change; the watcher below notices and reloads.
  useEffect(() => {
    if (repoId === null) return;
    setSync(null);
    if (noGit) return; // nothing to fetch without git
    let stopped = false;
    let lastAttempt = 0;
    const run = async (force = false) => {
      const now = Date.now();
      if (stopped || document.visibilityState !== "visible" || (!force && now - lastAttempt < 15_000)) return;
      lastAttempt = now;
      setSync((previous) => ({ synced_at: previous?.synced_at ?? null, error: previous?.error ?? null, running: true }));
      try {
        const result = await api.sync(repoId);
        if (!stopped) setSync({ ...result, running: false });
      } catch (e) {
        if (!stopped) setSync((previous) => ({ synced_at: previous?.synced_at ?? null, error: (e as ApiError).message, running: false }));
      }
    };
    run(true);
    const timer = window.setInterval(() => run(true), 60_000);
    const onFocus = () => run();
    window.addEventListener("focus", onFocus);
    syncNow.current = () => run(true);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [repoId, noGit]);

  // Uncommitted work exists only on the checked-out branch.
  const canIncludeUncommitted = branches !== null && head === branches.current;
  const watchUncommitted = uncommitted && canIncludeUncommitted;

  // Shortcut keys from Settings. Next and previous file belong to Changes, which listens
  // for them itself. The handler is read through a ref so it always sees this render.
  const shortcuts = prefs?.shortcuts ?? {};
  const onShortcut = useRef<(event: KeyboardEvent) => void>(() => {});
  onShortcut.current = (event) => {
    if (typing(event) || event.defaultPrevented || adding || removing) return;
    const key = keyName(event);
    const action = key && Object.keys(shortcuts).find((name) => shortcuts[name] === key);
    if (!action) return;
    if (action.startsWith("view:")) setView(action.slice(5) as View);
    else if (action === "theme") toggleTheme();
    else if (action === "uncommitted") canIncludeUncommitted && setUncommitted((on) => !on);
    else if (action === "sync") syncNow.current();
    else return;
    event.preventDefault();
  };
  useEffect(() => {
    const listen = (event: KeyboardEvent) => onShortcut.current(event);
    window.addEventListener("keydown", listen);
    return () => window.removeEventListener("keydown", listen);
  }, []);
  const viewKeys = Object.fromEntries(
    Object.entries(shortcuts).filter(([name, key]) => name.startsWith("view:") && key).map(([name, key]) => [name.slice(5), key]),
  ) as Partial<Record<View, string>>;
  // Asked once, before anything else: show uncommitted work from the start?
  const asking = prefs !== null && prefs.uncommitted === null && repos !== null && repos.length > 0;
  // The walkthrough: once, until it's finished or skipped, and again from Help.
  const [touringAgain, setTouringAgain] = useState(false);
  // It waits for a first project, since it walks through a project's screens.
  const touring = touringAgain || (prefs !== null && !prefs.tour_done && repos !== null && repos.length > 0);
  const endTour = () => {
    setTouringAgain(false);
    setPrefs((p) => p && { ...p, tour_done: true });
    changePrefs({ tour_done: true }).catch(() => {});
  };
  const answer = (on: boolean) => {
    setUncommitted(on);
    changePrefs({ uncommitted: on }).catch(() => setPrefs((p) => p && { ...p, uncommitted: on }));
  };

  // Watch git while the page is visible: a new branch, commit, checkout or (when shown)
  // an edit changes the fingerprint, and only then is anything reloaded.
  useEffect(() => {
    if (repoId === null) return;
    let last: string | null = null;
    let stopped = false;
    const check = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const signature = await api.state(repoId, watchUncommitted);
        if (stopped) return;
        if (last !== null && signature !== last) {
          setRevision((n) => n + 1);
          api.repos().then((list) => !stopped && setRepos(list)).catch(() => {});
        }
        last = signature;
      } catch {
        /* the backend is down; the next check tries again */
      }
    };
    check();
    const timer = window.setInterval(check, 2000);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, [repoId, watchUncommitted]);

  useEffect(() => {
    if (repoId === null || head === null || branches === null) return;
    if (!base && !branches.default_base) return;
    let stale = false;
    setLoading(true);
    setError(null);
    api
      .compare(repoId, { head, base: base ?? undefined, uncommitted: watchUncommitted })
      .then((result) => !stale && setComparison(result))
      .catch((e: ApiError) => !stale && setError(e.message))
      .finally(() => !stale && setLoading(false));
    return () => {
      stale = true;
    };
  }, [repoId, head, base, watchUncommitted, branches]);

  const repo = repos?.find((item) => item.id === repoId) ?? null;
  const setup = useSetup(repo);

  const replaceRepo = (updated: Repo) =>
    setRepos((list) => {
      const others = (list ?? []).filter((item) => item.id !== updated.id);
      return [...others, updated].sort((a, b) => a.name.localeCompare(b.name));
    });

  const removed = (id: number) => {
    const rest = (repos ?? []).filter((item) => item.id !== id);
    setRepos(rest);
    if (id === repoId) selectRepo(rest.find((item) => item.exists)?.id ?? null);
    setRemoving(null);
  };

  const added = (newRepo: Repo, note?: string) => {
    replaceRepo(newRepo);
    selectRepo(newRepo.id);
    setAdding(false);
    setAddedNote(note ?? null);
  };

  const openFile = (path: string) => {
    setFocus((f) => ({ path, count: (f?.count ?? 0) + 1 }));
    if (view !== "changes") setOpenedFrom(view);
    setView("changes");
  };
  // Leaving Changes any other way forgets where the file came from.
  useEffect(() => {
    if (view !== "changes") setOpenedFrom(null);
  }, [view]);
  const details = branches?.details ?? [];

  // Settings' own Back button: an AI's page goes up to AI; anywhere else leaves Settings for the
  // screen it was opened from (however many of its parts were opened since), or Home, which is
  // the first-run setup while there is no project yet.
  const beforeSettings = useRef<View>("home");
  useEffect(() => {
    if (view !== "settings") beforeSettings.current = view;
  }, [view]);
  const hasProjects = Boolean(repos && repos.length > 0);
  const leaveTo: View = hasProjects ? beforeSettings.current : "home";
  const settingsBack = section.startsWith("ai/")
    ? { label: "AI", go: () => setSection("ai") }
    : { label: hasProjects ? VIEWS.find((item) => item.id === leaveTo)!.label : "setup", go: () => setView(leaveTo) };

  const content = () => {
    // Settings work with no project at all.
    if (view === "settings") {
      return prefs ? (
        <Settings
          section={section}
          onSection={setSection}
          standalone={!(repos && repos.length > 0)}
          prefs={prefs}
          onPrefs={changePrefs}
          onResetShortcuts={() => api.resetShortcuts().then(setPrefs)}
          username={auth.username}
          passwordSet={auth.password_set}
          onSignOut={onSignOut}
          onPasswordSet={onAuthChange}
          ai={ai}
          onAiRefresh={refreshAi}
          onCloned={added}
          back={settingsBack}
        />
      ) : (
        <Loading label="Reading your settings…" />
      );
    }
    if (error && !repos) return <Notice title="Something needs attention">{error}</Notice>;
    if (repos && repos.length === 0) {
      return <Welcome ai={ai} onAiRefresh={refreshAi} onAdd={() => setAdding(true)} prefs={prefs} onPrefs={changePrefs} />;
    }
    if (view === "help" && repo) return <Help repo={repo} steps={setup.steps} error={setup.error} onTour={() => setTouringAgain(true)} />;
    if (view === "home" && repos) {
      return (
        <Home
          repos={repos}
          prefs={prefs}
          onPrefs={changePrefs}
          username={auth.username}
          repoId={repoId}
          version={`${repos.length}:${repoId}:${revision}`}
          comparison={comparison}
          branches={details}
          checkedOut={branches?.current ?? null}
          flow={flow}
          map={map}
          ai={ai}
          onHeadChange={setHead}
          onView={setView}
          onOpenFile={openFile}
          onAdd={() => setAdding(true)}
          onSync={() => syncNow.current()}
          onDigest={() => {
            setOpenChange(null);
            setView("digest");
          }}
          onOpenChange={(id) => {
            setOpenChange({ id, focus: null });
            setView("digest");
          }}
        />
      );
    }
    if (view === "digest" && repos) {
      return (
        <Digest
          connected={repos.filter((item) => item.claude).length}
          project={repo && { id: repo.id, name: repo.name, recording: repo.claude }}
          explainer={prefs?.ai.provider}
          version={`${repos.length}:${revision}`}
          onConnect={() => setView("project")}
          open={openChange}
          onOpen={setOpenChange}
          ai={ai}
          onSignedIn={refreshAi}
          explain={(change, path, name) => watchSignIn(api.explainChangePart(change, path, name))}
        />
      );
    }
    if (view === "project" && repos) {
      return (
        <div className="projects">
          <Sidebar
            repos={repos}
            selectedId={repoId}
            onSelect={(id) => id !== repoId && selectRepo(id)}
            onAdd={() => setAdding(true)}
            onRemove={setRemoving}
          />
          {repo && <ProjectPanel repo={repo} onRepoChange={replaceRepo} onRemove={() => setRemoving(repo)} />}
        </div>
      );
    }
    if (error) return <Notice title="Something needs attention">{error}</Notice>;
    if (repoId === null) {
      return <Notice title="Pick a project">None of your projects' folders can be found. Add one, or remove the missing ones.</Notice>;
    }
    if (view === "summary" || view === "kt") {
      return summary && repoId !== null && head !== null ? (
        <Summary
          key={`${repoId}:${head}`}
          scope={`${repoId}:${head}`}
          tab={view === "kt" ? "kt" : "overview"}
          onTab={(tab) => setView(tab === "kt" ? "kt" : "summary")}
          summary={summary}
          ai={ai}
          explain={(fresh) => watchSignIn(api.explainProject(repoId, head, fresh))}
          loadGuide={() => api.ktGuide(repoId, head)}
          writeGuide={(fresh) => watchSignIn(api.writeKtGuide(repoId, head, fresh))}
          imageUrl={(path) => api.ktImageUrl(repoId, head, path)}
          loadDetail={(worktree) => api.ktDetail(repoId, head, worktree)}
          writeDetail={(worktree, fresh) => watchSignIn(api.writeKtDetail(repoId, head, worktree, fresh))}
          explainFile={(path, fresh, worktree) => watchSignIn(api.explainFile(repoId, path, head, fresh, worktree))}
          onSignedIn={refreshAi}
          onOpenMap={() => setView("map")}
        />
      ) : (
        <Loading label="Reading the project…" shape="doc" />
      );
    }
    if (view === "ask") {
      return repo && head !== null ? (
        <Ask
          scope={`${repoId}:${head}`}
          project={repo.name}
          ai={ai}
          ask={(question, history) => watchSignIn(api.ask(repoId, question, history, head))}
          onSignedIn={refreshAi}
        />
      ) : (
        <Loading label="Reading the project…" shape="doc" />
      );
    }
    if (noGit) {
      if (view === "map") {
        return !map ? (
          <Loading label="Reading the project's folders…" shape="graph" />
        ) : map.areas.length === 0 ? (
          <Notice title="Project map">No files found in this folder.</Notice>
        ) : (
          // No changes to open a file in without git: its note in the KT instead.
          <ProjectMap map={map} files={[]} onOpenFile={() => setView("kt")} onSelect={pickMap} />
        );
      }
      const screen = VIEWS.find((item) => item.id === view)?.label ?? "This screen";
      return (
        <Notice title={`${screen} needs git`}>
          {repo?.name ?? "This project"} isn't a git repository, so it has no branches, commits or changes to show.
          The summary, KT, Ask and project map work. Run <code>git init</code> in its folder to turn this on.
        </Notice>
      );
    }
    if (branches && !branches.default_base && !base) return <BasePicker branches={branches} head={head} onPick={setBase} />;
    if (!comparison) return <Loading label="Reading your branch from git…" />;

    const compareOptions = { base: base ?? undefined, head: comparison.head, uncommitted: comparison.uncommitted };
    switch (view) {
      case "overview":
        return (
          <Overview
            comparison={comparison}
            branches={details}
            flow={flow}
            map={map}
            onHeadChange={setHead}
            onView={setView}
            onOpenFile={openFile}
          />
        );
      case "flow":
        return (
          <div className="flow-view">
            {flow && flow.commits.length > 1 ? (
              <FlowGraph flow={flow} head={comparison.head} branches={details} onPick={setHead} fill />
            ) : (
              <Notice title="Branch flow">Not enough history to draw yet.</Notice>
            )}
            <BranchTable branches={details} current={branches?.current ?? null} shown={comparison.head} onPick={setHead} />
          </div>
        );
      case "map":
        return map && map.areas.length > 0 ? (
          <ProjectMap map={map} files={comparison.files} onOpenFile={openFile} onSelect={pickMap} />
        ) : (
          <Loading label="Reading the project's folders…" shape="graph" />
        );
      case "changes":
        return comparison.files.length === 0 ? (
          <Notice title="Nothing changed yet">
            <code>{comparison.head}</code> has no changes compared with <code>{comparison.base}</code>.
            {canIncludeUncommitted && !uncommitted && " Turn on Show uncommitted work in Settings to see edits you haven't committed."}
          </Notice>
        ) : (
          <FileChanges
            files={comparison.files}
            focus={focus}
            version={`${comparison.head}:${comparison.base}:${comparison.uncommitted}:${revision}`}
            scope={`${repoId}:${comparison.base}:${comparison.head}:${comparison.uncommitted}`}
            fileNote={(path) => {
              const file = kt?.files.find((item) => item.path === path);
              if (!file) return null;
                            const key = `file:${repoId}:${head}:${path}`;
              const run = job(key);
              return {
                path,
                note: file.explanation ?? result<FileExplanation>(key) ?? null,
                ai,
                onSignedIn: refreshAi,
                busy: run?.state === "working",
                problem: run?.state === "failed" ? run.error : null,
                explain: () => {
                  clear(key);
                  start(key, () => watchSignIn(api.explainFile(repoId, path, head!))).catch(() => {});
                },
              };
            }}
            loadFunctions={(file) => api.functions(repoId, file, compareOptions)}
            explainFunction={(file, name) => watchSignIn(api.explainFunction(repoId, file, name, compareOptions))}
            ai={ai}
            onSignedIn={refreshAi}
            onSelect={pickChanges}
            keys={{ next: shortcuts["next-file"], previous: shortcuts["previous-file"] }}
          />
        );
      case "commits":
        return (
          <>
            <CommitList commits={comparison.commits} base={comparison.base} />
            <PullRequests repoId={repoId} />
          </>
        );
    }
  };

  const current = VIEWS.find((item) => item.id === view)!;
  const label = (id: View) => VIEWS.find((item) => item.id === id)!.label;
  // Home › project › (the screen a file came from) › this screen › what's picked on it.
  const crumbs: { label: string; go?: () => void }[] = [];
  if (view !== "home") crumbs.push({ label: "Home", go: () => setView("home") });
  if (repo && PROJECT_VIEWS.has(view)) crumbs.push({ label: repo.name, go: view === "summary" ? undefined : () => setView("summary") });
  // Home is already the first step.
  if (openedFrom && openedFrom !== "home" && view === "changes") crumbs.push({ label: label(openedFrom), go: () => setView(openedFrom) });
  // Settings › AI › Ollama: each step back up the folder.
  const deeper = view === "settings" && section !== "general";
  crumbs.push({ label: current.label, go: deeper ? () => setSection("general") : undefined });
  if (deeper && section.startsWith("ai/")) crumbs.push({ label: "AI", go: () => setSection("ai") });
  if (deeper) crumbs.push({ label: settingsSectionLabel(section) });
  if (picked && picked.view === view) crumbs.push({ label: picked.label });
  // The back arrow returns to the screen this one was opened from, as the browser's Back does.
  const fromView = cameFrom?.split("/")[0];
  const back = fromView && VIEWS.some((item) => item.id === fromView)
    ? { label: label(fromView as View), go: () => history.back() }
    : null;

  return (
    <div className="app">
      {/* Changes is a page of its own: its file list is the menu there, and the breadcrumb's
          back arrow leads out. */}
      {repos && repos.length > 0 && view !== "changes" && (
        <SideMenu
          view={view}
          onView={(next) => {
            // AI changes again, from a prompt's own changes: back to the day.
            if (next === "digest" && view === "digest") setOpenChange(null);
            setView(next);
          }}
          settings={section}
          onSettings={setSection}
          aiInUse={prefs?.ai.provider}
          off={{
            ...(repos && !repos.some((item) => item.claude) ? { digest: NOT_RECORDING } : {}),
            ...(noGit ? { changes: NEEDS_GIT, commits: NEEDS_GIT } : {}),
          }}
          keys={viewKeys}
          badges={{
            changes: comparison?.files.length,
            commits: comparison?.commits.length,
            help: setup.todo,
          }}
          project={<ProjectPicker repos={repos} selectedId={repoId} onSelect={selectRepo} onAdd={() => setAdding(true)} />}
        />
      )}

      <div className="main">
        <header className={`topbar${repos && repos.length > 0 && view === "home" ? " topbar--bare" : ""}`}>
          {/* Home has its own header, so the bar only carries the controls there. */}
          {repos && repos.length > 0 && view === "home" ? null : repos && repos.length > 0 ? (
            <div className="topbar__title">
              <Breadcrumb crumbs={crumbs} back={back} />
              <h1>{current.label}</h1>
              <p>
                {current.hint}
                {repo && comparison && view !== "digest" && view !== "project" && view !== "help" && view !== "settings" && (
                  <>
                    {" "}
                    · <code>{comparison.head}</code> in {repo.name}
                  </>
                )}
              </p>
            </div>
          ) : (
            <Logo size={34} wordmark />
          )}
          <div className="topbar__controls">
            {sync && <SyncStatus sync={sync} onSync={() => syncNow.current()} />}
            {/* Without a project the menu is hidden, so Settings is reached from here. */}
            {!(repos && repos.length > 0) && (
              <button className="theme-button" onClick={() => setView("settings")}>
                Settings
              </button>
            )}
          </div>
        </header>

        <main className={`screen screen--${view}${loading ? " screen--loading" : ""}`}>
          {addedNote && (
            <div className="added-note" role="status">
              <p>{addedNote}</p>
              <button onClick={() => setAddedNote(null)} aria-label="Dismiss">
                OK
              </button>
            </div>
          )}
          {content()}
        </main>
      </div>

      {asking && <AskUncommitted onAnswer={answer} />}
      {shown && !asking && touring && <Tour onView={setView} onDone={endTour} />}
      {adding && (
        <AddProject
          onClose={() => setAdding(false)}
          onAdded={added}
          onGitHub={() => {
            setAdding(false);
            setSection("github");
            setView("settings");
          }}
          onCodeCommit={() => {
            setAdding(false);
            setSection("codecommit");
            setView("settings");
          }}
        />
      )}
      {removing && <RemoveProject repo={removing} onClose={() => setRemoving(null)} onRemoved={removed} />}
    </div>
  );
}

// Asked once, the first time the dashboard opens with a project: whether to show
// uncommitted work from the start. Settings can change the answer later.
function AskUncommitted({ onAnswer }: { onAnswer: (on: boolean) => void }) {
  return (
    <div className="ask" role="dialog" aria-modal="true" aria-labelledby="ask-title">
      <section className="card ask__card">
        <h2 id="ask-title">Show work you haven't committed yet?</h2>
        <p className="settings__note">
          Looma can include edits you haven't committed in Changes, This branch and the map, every time it opens. You can
          change this any time in Settings.
        </p>
        <div className="ask__choices">
          <button className="ask__choice" onClick={() => onAnswer(true)} autoFocus>
            <strong>Yes, always include uncommitted work</strong>
            <span>See every edit as soon as you make it, committed or not.</span>
          </button>
          <button className="ask__choice" onClick={() => onAnswer(false)}>
            <strong>No, only committed work to start with</strong>
            <span>Turn it on in Settings when you want it.</span>
          </button>
        </div>
      </section>
    </div>
  );
}

// Screens about one project; the breadcrumb names the project before them.
// Why a screen is off for a project that isn't a git repository.
const NEEDS_GIT = "Needs git. This project isn't a git repository; run git init in its folder to turn this on.";
const PROJECT_VIEWS = new Set<View>(["summary", "kt", "ask", "overview", "flow", "map", "changes", "commits", "help"]);

// Where you are: Home › project › screen › what's picked. Every step but the last goes back to
// it. The arrow in front goes back to the previous screen, or, on a screen opened straight
// from the address bar, one step up the trail.
function Breadcrumb({ crumbs, back }: { crumbs: { label: string; go?: () => void }[]; back: { label: string; go: () => void } | null }) {
  const up = back ?? crumbs.slice(0, -1).reverse().find((crumb) => crumb.go);
  return (
    <nav className="crumbs" aria-label="Where you are">
      {up && (
        <button className="crumbs__back" onClick={up.go} aria-label={`Back to ${up.label}`} title={`Back to ${up.label}`}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 3.5 5.5 8l4.5 4.5" />
          </svg>
        </button>
      )}
      <ol>
        {crumbs.map((crumb, i) => (
          <li key={i}>
            {crumb.go && i < crumbs.length - 1 ? (
              <button onClick={crumb.go}>{crumb.label}</button>
            ) : (
              <span aria-current={i === crumbs.length - 1 ? "page" : undefined}>{crumb.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

// Every local branch and where it stands, beside the flow graph.
function BranchTable(props: { branches: Branches["details"]; current: string | null; shown: string; onPick: (name: string) => void }) {
  return (
    <section className="card branches">
      <h2 className="card__title">Branches on this computer</h2>
      <ul className="branches__list">
        {props.branches.map((branch) => (
          <li key={branch.name}>
            <button
              className={`branches__item${branch.name === props.shown ? " branches__item--shown" : ""}`}
              onClick={() => props.onPick(branch.name)}
            >
              <span className="branches__name">{branch.name}</span>
              {branch.name === props.current && <span className="branches__tag branches__tag--current">checked out</span>}
              {branch.gone || branch.merged ? (
                <span className="branches__tag branches__tag--done">{branchNote(branch)}</span>
              ) : (
                <span className="branches__tag">open</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SyncStatus({ sync, onSync }: { sync: Sync & { running: boolean }; onSync: () => void }) {
  const label = sync.running
    ? "Syncing with GitHub…"
    : sync.error
      ? "Couldn't sync with GitHub"
      : sync.synced_at
        ? `Synced ${new Date(sync.synced_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        : "Not synced yet";
  return (
    <button
      className={`sync${sync.error && !sync.running ? " sync--error" : ""}`}
      onClick={onSync}
      disabled={sync.running}
      title={sync.error ?? "Fetch the latest branches from GitHub"}
    >
      <span className={`sync__dot${sync.running ? " sync__dot--running" : ""}`} />
      {label}
    </button>
  );
}

// Most projects merge into main, master, develop or dev and Looma finds it. For any
// other name, the user says which branch work is merged into.
function BasePicker({ branches, head, onPick }: { branches: Branches; head: string | null; onPick: (base: string) => void }) {
  const others = branches.branches.filter((name) => name !== head);
  return (
    <section className="card notice">
      <h2>Which branch do you merge into?</h2>
      <p>
        This project has no main, master, develop or dev branch, so Looma doesn't know what to compare{" "}
        {head ? <code>{head}</code> : "this branch"} with.
      </p>
      {others.length === 0 ? (
        <p>It has only one branch, so there is nothing to compare with yet.</p>
      ) : (
        <select className="select" defaultValue="" onChange={(event) => event.target.value && onPick(event.target.value)} aria-label="Branch to compare with">
          <option value="" disabled>
            Pick a branch
          </option>
          {others.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      )}
    </section>
  );
}

// The first run: connect Claude (optional, and right here), then add a project.
function Welcome({ ai, onAiRefresh, onAdd, prefs, onPrefs }: {
  ai: AiStatus | null;
  onAiRefresh: () => void;
  onAdd: () => void;
  prefs: Preferences | null;
  onPrefs: (changes: PreferenceChange) => Promise<void>;
}) {
  const ready = ai?.available && ai.signed_in !== false;
  return (
    <section className="card welcome">
      <h1>See what changed in your code</h1>
      <p>Looma turns your branches and commits into a page anyone can read. Two quick steps and you're in.</p>
      <ol className="welcome__steps">
        <li>
          <strong>Connect an AI {ready ? "✓" : <span className="welcome__optional">optional</span>}</strong>
          <span>
            Claude, ChatGPT Codex, a free model on this computer, or Antigravity: it explains every change in plain English.
            Recording what your AI coding tool changes works either way, and you can change this later in Settings.
          </span>
        </li>
        <li>
          <strong>Add a project</strong>
          <span>Point Looma at any git folder on this computer, and pick your AI coding tool to record the request behind each change.</span>
        </li>
        <li>
          <strong>Open a branch</strong>
          <span>See every file and function it changed compared with main.</span>
        </li>
      </ol>
      <div className="welcome__claude">
        {prefs ? (
          <AiPicker prefs={prefs} onPrefs={onPrefs} onActiveChange={onAiRefresh} active={ai} />
        ) : (
          <ClaudeSetup ai={ai} onRefresh={onAiRefresh} />
        )}
      </div>
      <div className="welcome__actions">
        <Button variant="gradient" size="lg" onClick={onAdd}>
          Add your first project
        </Button>
        {!ready && <span className="welcome__skip">No AI for now? Just add a project; you can connect one later.</span>}
      </div>
    </section>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card notice">
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}
