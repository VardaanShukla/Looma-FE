// Looma was called DevDash: what this browser kept under the old name (the theme, the diff
// layout, the folded menu, Ask's conversations) moves to the new one, once, before anything
// reads it. Imported first by main.tsx for that reason.
const OLD = "devdash";
const NEW = "looma";

try {
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(OLD)) continue;
    const renamed = NEW + key.slice(OLD.length);
    const value = localStorage.getItem(key);
    if (value !== null && localStorage.getItem(renamed) === null) localStorage.setItem(renamed, value);
    localStorage.removeItem(key);
  }
} catch {
  // Storage unavailable: these are conveniences, and the page starts with its defaults.
}
