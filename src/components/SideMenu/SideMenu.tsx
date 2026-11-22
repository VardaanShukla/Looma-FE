import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Repo } from "../../api/types";
import Logo from "../Logo/Logo";
import "./SideMenu.css";

// The menu down the left side: the brand, the project, then one item per view, with
// Settings and Help at the bottom. Each item's shortcut key (set in Settings) shows in its
// tooltip; App listens for the keys. It folds down to icons (remembered per browser), and
// on a phone it turns into a bar along the bottom.
//
// Settings opens like a folder: its parts (and AI's, one per AI) show under it while it's
// on screen, and pick what Settings shows.

export type View = "home" | "digest" | "summary" | "kt" | "ask" | "overview" | "flow" | "map" | "changes" | "commits" | "git" | "project" | "settings" | "help";

// Screens marked inMenu: false are sections of Home; Home's links open their full screen.
// The menu runs from tracking changes (git and AI) to understanding the project.
export const VIEWS: { id: View; label: string; hint: string; icon: ReactNode; inMenu?: false }[] = [
  { id: "home", label: "Home", hint: "Your dashboard: what needs you, AI changes today and the branch at a glance. Customise it to show what you need", icon: <HomeIcon /> },
  { id: "digest", label: "AI changes", hint: "What your AI coding tool changed each day, and what to check", icon: <DigestIcon /> },
  { id: "changes", label: "Changes", hint: "Every changed file and function, before and after", icon: <DiffIcon /> },
  { id: "commits", label: "Commits", hint: "Each saved step on this branch, and the project's open pull requests", icon: <CommitIcon /> },
  { id: "git", label: "Git", hint: "Save your work, share it with your team, and manage branches, in plain words", icon: <GitIcon /> },
  { id: "overview", label: "This branch", hint: "The branch on screen at a glance", icon: <GaugeIcon /> },
  { id: "flow", label: "Branch flow", hint: "How branches split off and merge back", icon: <FlowIcon /> },
  { id: "map", label: "Project map", hint: "The parts of the project and what uses what", icon: <MapIcon /> },
  { id: "summary", label: "Summary", hint: "The whole project: what it is and how it works", icon: <SummaryIcon /> },
  { id: "kt", label: "KT", hint: "A guide for a new developer, with setup, run commands and major functions", icon: <KtIcon /> },
  { id: "ask", label: "Ask", hint: "Ask questions about the project: what a file or function is for and how the parts fit together", icon: <AskIcon /> },
  { id: "project", label: "Projects", hint: "Add, switch or remove projects", icon: <FolderIcon /> },
  { id: "settings", label: "Settings", hint: "Your account, the look, the AI that explains, recording, GitHub, CodeCommit and shortcut keys", icon: <SettingsIcon /> },
  { id: "help", label: "Help", hint: "Set Looma up and learn what each screen shows", icon: <HelpIcon /> },
];
export type SettingsSection =
  | "general"
  | "appearance"
  | "ai"
  | "ai/claude"
  | "ai/codex"
  | "ai/ollama"
  | "ai/antigravity"
  | "ai/hosted"
  | "recording"
  | "github"
  | "codecommit"
  | "shortcuts";

export const SETTINGS_SECTIONS: { id: SettingsSection; label: string; icon: ReactNode; children?: { id: SettingsSection; label: string }[] }[] = [
  { id: "general", label: "General", icon: <UserIcon /> },
  { id: "appearance", label: "Appearance", icon: <PaletteIcon /> },
  {
    id: "ai",
    label: "AI",
    icon: <DigestIcon />,
    children: [
      { id: "ai/claude", label: "Claude" },
      { id: "ai/codex", label: "ChatGPT Codex" },
      { id: "ai/ollama", label: "Ollama" },
      { id: "ai/antigravity", label: "Antigravity" },
      { id: "ai/hosted", label: "Your server" },
    ],
  },
  { id: "recording", label: "Recording", icon: <RecordIcon /> },
  { id: "github", label: "GitHub", icon: <GitHubIcon /> },
  { id: "codecommit", label: "CodeCommit", icon: <CodeCommitIcon /> },
  { id: "shortcuts", label: "Shortcuts", icon: <KeyboardIcon /> },
];

export function settingsSectionLabel(id: SettingsSection): string {
  for (const section of SETTINGS_SECTIONS) {
    if (section.id === id) return section.label;
    const child = section.children?.find((item) => item.id === id);
    if (child) return child.label;
  }
  return "Settings";
}

// The menu's top level stays short: the screens about the branch's code and the ones that
// explain the project fold into two groups, opened like Settings. A group opens by itself
// while one of its screens is on show. Settings and Help sit apart, at the bottom.
type Group = { id: string; label: string; hint: string; icon: ReactNode; views: View[] };
const GROUPS: Group[] = [
  { id: "code", label: "Code", hint: "Changes, commits, git steps, this branch and how branches flow", icon: <CodeIcon />,
    views: ["changes", "commits", "git", "overview", "flow"] },
  { id: "understand", label: "Understand", hint: "The project's summary, map, KT guide and questions about it", icon: <BookIcon />,
    views: ["summary", "map", "kt", "ask"] },
];
const TOP: (View | Group)[] = ["home", "digest", GROUPS[0], GROUPS[1], "project"];
const BOTTOM: View[] = ["settings", "help"];
const entryOf = (id: View) => VIEWS.find((view) => view.id === id)!;
const groupOf = (id: View) => GROUPS.find((group) => group.views.includes(id));

type Props = {
  view: View;
  onView: (view: View) => void;
  // Counts shown on an item, such as how many files changed.
  badges?: Partial<Record<View, number>>;
  // The project switcher, shown under the brand.
  project?: ReactNode;
  // Each screen's shortcut key, for its tooltip.
  keys?: Partial<Record<View, string>>;
  // The part of Settings on screen, and picking another.
  settings: SettingsSection;
  onSettings: (section: SettingsSection) => void;
  // The AI that writes explanations, marked under AI.
  aiInUse?: string;
  // Screens that can't work yet, with why: shown dimmed, the reason as their tooltip.
  off?: Partial<Record<View, string>>;
};

const COLLAPSED_KEY = "looma:menu-collapsed";

function savedCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

// A narrow window always gets the icons, whatever was picked.
// A count past 99 shows as 99+, so the badge stays a dot beside an icon; the tooltip has it all.
function badgeText(count: number): string {
  return count > 99 ? "99+" : String(count);
}

const NARROW = "(max-width: 1100px)";
// Where the menu is a bar along the bottom (see SideMenu.css).
const PHONE = "(max-width: 720px)";

function useMedia(media: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(media).matches);
  useEffect(() => {
    const query = window.matchMedia(media);
    const change = () => setMatches(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, [media]);
  return matches;
}

export default function SideMenu({ view, onView, badges = {}, project, keys = {}, settings, onSettings, aiInUse, off = {} }: Props) {
  const [collapsed, setCollapsed] = useState(savedCollapsed);
  const narrow = useMedia(NARROW);
  const phone = useMedia(PHONE);
  const folded = collapsed || narrow;
  const fold = () => {
    setCollapsed(!collapsed);
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "0" : "1");
    } catch {
      // Only a convenience: the menu just opens wide next time.
    }
  };
  // A Home section's full screen lights Home in the menu.
  const lit = VIEWS.find((entry) => entry.id === view)?.inMenu === false ? "home" : view;
  // One group is open at a time: the one picked by hand, else the one holding the screen on
  // show. Closing that one keeps it closed until another screen is picked. On a phone a group
  // floats over the screen, so it opens only when tapped and closes once a screen is picked.
  const holding = groupOf(lit)?.id ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setPicked(null), [lit]);
  const current = picked === null ? (phone ? null : holding) : picked === "" ? null : picked;
  const showing = (group: Group) => current === group.id;
  const toggle = (group: Group) => setPicked(showing(group) ? "" : group.id);
  const item = (entry: (typeof VIEWS)[number], child = false) => (
    <button
      key={entry.id}
      className={`menu__item${child ? " menu__item--child" : ""}${lit === entry.id ? " menu__item--active" : ""}${off[entry.id] ? " menu__item--off" : ""}`}
      onClick={() => onView(entry.id)}
      data-tour={entry.id}
      aria-current={view === entry.id ? "page" : undefined}
      title={off[entry.id] ? `${entry.label}: ${off[entry.id]}` : `${entry.label}: ${entry.hint}${keys[entry.id] ? ` (key ${keys[entry.id]})` : ""}`}
    >
      <span className="menu__icon">{entry.icon}</span>
      <span className="menu__label">{entry.label}</span>
      {badges[entry.id] ? (
        <span className={`menu__badge menu__badge--${entry.id}`} title={String(badges[entry.id])}>
          {badgeText(badges[entry.id]!)}
        </span>
      ) : null}
      {entry.id === "settings" && <ChevronIcon open={view === "settings"} />}
    </button>
  );
  const open = view === "settings";
  // Settings' parts, shown while Settings is on screen. AI's own list shows while one of its
  // parts is picked; folded, only the parts' icons show.
  const settingsParts = open && (
    <div className="menu__sub" role="group" aria-label="Settings">
      {SETTINGS_SECTIONS.map((section) => {
        const inside = settings === section.id || settings.startsWith(`${section.id}/`);
        return (
          <div key={section.id} className="menu__subgroup">
            <button
              className={`menu__subitem${inside ? " menu__subitem--active" : ""}`}
              onClick={() => onSettings(section.id)}
              aria-current={settings === section.id ? "page" : undefined}
              title={section.label}
            >
              <span className="menu__icon menu__icon--small">{section.icon}</span>
              <span className="menu__label">{section.label}</span>
            </button>
            {section.children && inside && !folded && (
              <div className="menu__leaves">
                {section.children.map((child) => (
                  <button
                    key={child.id}
                    className={`menu__leaf${settings === child.id ? " menu__leaf--active" : ""}`}
                    onClick={() => onSettings(child.id)}
                    aria-current={settings === child.id ? "page" : undefined}
                  >
                    <span className="menu__label">{child.label}</span>
                    {aiInUse && child.id === `ai/${aiInUse}` && (
                      <span className="menu__inuse" title="Writes explanations now">
                        In use
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const group = (entry: Group) => {
    const open = showing(entry);
    const inside = entry.id === holding;
    // Closed, the group carries its screens' counts so nothing hides behind it.
    const count = open ? 0 : entry.views.reduce((sum, id) => sum + (badges[id] ?? 0), 0);
    return (
      <div key={entry.id} className={`menu__group${open ? " menu__group--open" : ""}`}>
        <button
          className={`menu__item menu__item--group${inside && !open ? " menu__item--active" : ""}${inside ? " menu__item--holding" : ""}`}
          onClick={() => toggle(entry)}
          aria-expanded={open}
          title={`${entry.label}: ${entry.hint}`}
        >
          <span className="menu__icon">{entry.icon}</span>
          <span className="menu__label">{entry.label}</span>
          {count > 0 && <span className="menu__badge menu__badge--changes">{badgeText(count)}</span>}
          <ChevronIcon open={open} />
        </button>
        <div className="menu__drawer" inert={!open}>
          <div className="menu__sub menu__sub--views" role="group" aria-label={entry.label}>
            {entry.views.map((id) => item(entryOf(id), true))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <aside className={`menu${folded ? " menu--collapsed" : ""}`}>
      <div className="menu__head">
        <Logo size={folded ? 30 : 30} wordmark={!folded} className="menu__brand" />
        {!narrow && (
          <button
            type="button"
            className="menu__fold"
            onClick={fold}
            aria-expanded={!folded}
            aria-label={folded ? "Show the menu's names" : "Fold the menu to icons"}
            title={folded ? "Show names" : "Fold to icons"}
          >
            <FoldIcon collapsed={folded} />
          </button>
        )}
      </div>
      {project && <div className="menu__project">{project}</div>}
      <nav className="menu__nav" aria-label="Views">
        {TOP.map((entry) => (typeof entry === "string" ? item(entryOf(entry)) : group(entry)))}
        <span className="menu__spacer" />
        {item(entryOf(BOTTOM[0]))}
        {settingsParts}
        {item(entryOf(BOTTOM[1]))}
      </nav>
    </aside>
  );
}

// The project picker under the brand. It opens in place: the list slides open and pushes
// the menu's items down, and folds away again (its arrow turning back) once a project is
// picked, on a second click, on Escape or on a click anywhere else.
export function ProjectPicker({ repos, selectedId, onSelect, onAdd }: {
  repos: Repo[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onAdd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = repos.find((repo) => repo.id === selectedId) ?? null;

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const pick = (id: number) => {
    setOpen(false);
    if (id !== selectedId) onSelect(id);
  };

  return (
    <div className={`picker${open ? " picker--open" : ""}`} ref={box}>
      <span className="switcher__label">Project</span>
      <div className="switcher">
        <button
          type="button"
          className="picker__current"
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          aria-controls="project-picker-list"
          title={current ? current.path : "Pick a project"}
        >
          <span className="picker__initial" aria-hidden="true">
            {(current?.name ?? "?").slice(0, 1).toUpperCase()}
          </span>
          <span className="picker__name">{current?.name ?? "Pick a project"}</span>
          <svg {...iconProps} width={14} height={14} className="picker__chevron" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <button className="switcher__add" onClick={onAdd} title="Add a project" aria-label="Add a project">
          +
        </button>
      </div>
      {/* Always in the page, so opening and closing can slide: its row grows from nothing. */}
      <div className="picker__drawer" inert={!open}>
        <ul className="picker__list" id="project-picker-list" role="listbox" aria-label="Projects">
          {repos.map((repo) => (
            <li key={repo.id}>
              <button
                type="button"
                role="option"
                aria-selected={repo.id === selectedId}
                className={`picker__option${repo.id === selectedId ? " picker__option--on" : ""}`}
                onClick={() => pick(repo.id)}
                disabled={!repo.exists}
                title={repo.exists ? repo.path : `${repo.path} (folder missing)`}
              >
                <span className="picker__initial" aria-hidden="true">
                  {repo.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="picker__name">
                  {repo.name}
                  {!repo.exists && <em> folder missing</em>}
                  {repo.exists && !repo.git && <em> no git</em>}
                </span>
                {repo.id === selectedId && (
                  <svg {...iconProps} width={14} height={14} aria-hidden="true">
                    <path d="M5 12l5 5 9-10" />
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function GaugeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4.5 17a8.5 8.5 0 1 1 15 0" />
      <path d="M12 13l4-4" />
      <circle cx="12" cy="13" r="1.2" />
    </svg>
  );
}

function GitIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="9" r="2" />
      <path d="M6 7v10M18 11a6 6 0 0 1-6 6H8" />
    </svg>
  );
}

function FlowIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="5" cy="6" r="2" />
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="12" r="2" />
      <path d="M5 8v8M7 6h3a5 5 0 0 1 5 5v1h2" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="3" width="7" height="6" rx="1.5" />
      <rect x="14" y="15" width="7" height="6" rx="1.5" />
      <rect x="14" y="3" width="7" height="6" rx="1.5" />
      <path d="M10 6h4M17.5 9v6M10 7.5l4.5 7" />
    </svg>
  );
}

function DiffIcon() {
  return (
    <svg {...iconProps}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M9 12h6M12 9v6M9 17h6" />
    </svg>
  );
}

function CommitIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M2 12h6.5M15.5 12H22" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4" />
      <circle cx="12" cy="16.8" r="0.6" fill="currentColor" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

function DigestIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z" />
      <path d="M5 17h14M5 21h9" />
    </svg>
  );
}

function AskIcon() {
  return (
    <svg {...iconProps}>
      <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
      <path d="M10 9.2a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9v.3M12 14h.01" />
    </svg>
  );
}

function KtIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 6c-2-1.5-4.5-2-8-2v15c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2V4c-3.5 0-6 .5-8 2Z" />
      <path d="M12 6v15" />
    </svg>
  );
}

// Angle brackets, for the screens about the code itself.
function CodeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14" />
    </svg>
  );
}

// An open lightbulb, for the screens that explain the project.
function BookIcon() {
  return (
    <svg {...iconProps}>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" />
    </svg>
  );
}

function SummaryIcon() {
  return (
    <svg {...iconProps}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg {...iconProps} width={14} height={14} className={`menu__chevron${open ? " menu__chevron--open" : ""}`} aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function FoldIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg {...iconProps} width={18} height={18} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M9 4v16" />
      <path d={collapsed ? "M13 10l2 2-2 2" : "M16 10l-2 2 2 2"} />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function PaletteIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.2-9-7.2z" />
      <circle cx="7.5" cy="11" r="1" fill="currentColor" />
      <circle cx="10.5" cy="7" r="1" fill="currentColor" />
      <circle cx="15" cy="7.5" r="1" fill="currentColor" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg {...iconProps}>
      <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
    </svg>
  );
}

// A branch splitting and merging back, for CodeCommit (whose own mark is AWS's to use).
function CodeCommitIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="9" r="2" />
      <path d="M6 7v10M18 11c0 4-5 4-11.2 6.6" />
    </svg>
  );
}

function RecordIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" />
    </svg>
  );
}

function KeyboardIcon() {
  return (
    <svg {...iconProps}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9" />
    </svg>
  );
}
