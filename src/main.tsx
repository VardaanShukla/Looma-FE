// First, so settings saved under the old name are in place before anything reads them.
import "./lib/renamedStorage";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// The fonts ship with the page (Latin only), so the dashboard needs no font server: Manrope
// for text, Unbounded for the LOOMA wordmark and big headings. A browser only fetches a
// weight when something on screen uses it.
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/manrope/latin-800.css";
import "@fontsource/unbounded/latin-400.css";
import "@fontsource/unbounded/latin-500.css";
import "@fontsource/unbounded/latin-600.css";
// Tailwind first, then shared styles, so each component's own CSS can override them.
import "./index.css";
import "./styles/theme.css";
import "./styles/ui.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
