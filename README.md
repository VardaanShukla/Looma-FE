<img src="public/looma.svg" width="72" alt="Looma logo">

# Looma (dashboard page)

Looma shows what changed in your code in plain words, so people who don't read code can
follow it: what a branch changed, what your AI coding tool did and why, the whole project on one
page, and knowledge-transfer guides (a brief one, and a detailed one with a map, step-by-step
flows and every file) to download as a PDF or an interactive page.

This repo is the dashboard page: React and TypeScript, built with Vite. Everything it shows
comes from the Looma backend, [DevDash-BE](https://github.com/VardaanShukla/DevDash-BE),
which also serves a built copy of this page. The backend's README describes every feature,
how to install Looma and every endpoint.

Looma was called Looma until November 2026. Only the name changed: the command is still
`looma` (`looma` works too once installed from this version), your data stays in `~/.looma`,
the `LOOMA_*` settings and the `/api` addresses are the same, and the repos keep their names.

## Use it

You don't need this repo or Node to use Looma: the backend comes with a built copy of
this page. On Linux, macOS or Windows:

```sh
pipx install git+https://github.com/VardaanShukla/DevDash-BE.git
looma serve
```

Then open http://127.0.0.1:8765. See the backend's README for more.

## Work on it

Needs Node 18 or newer.

1. Keep the backend running: `looma serve`.
2. In this repo, start the dev server, which reloads as you edit:

   ```sh
   npm install
   npm run dev
   ```

3. Open http://localhost:5173.

The dev server forwards every `/api` call to `http://127.0.0.1:8765` (see
`vite.config.ts`). The API only accepts changes from the page on port 5173 or 4173 (or from
the one it serves itself), so keep those ports.

To ship a change, build it into the backend and commit the result there:

```sh
cd ../DevDash-BE
python scripts/build_ui.py ../DevDash-FE
```

`npm run build` alone type-checks and writes the page to `dist/`; `npm run preview` serves
that on http://localhost:4173.

## What's inside

- `src/main.tsx` starts the page; `src/App.tsx` picks the screen from the side menu and loads
  its data.
- `src/api/` talks to the backend: `client.ts` for requests, `types.ts` for what each
  endpoint returns.
- `src/components/<Name>/` holds one screen or part of a screen each, with its own CSS:
  - Home, and Widgets: the grid of widgets it's made of, with every kind in `catalog.tsx`.
  - Overview (this branch), FlowGraph (branch flow), ProjectMap, FileChanges and
    FunctionChanges (Changes), CommitList and PullRequests (Commits), Digest (AI changes).
  - Summary, with the KT tab: `ktPdf.ts` writes the Brief KT's PDF; the Detailed KT is
    `DetailedKt.tsx`, built from one model (`ktModel.ts`) drawn by `KtDocument.tsx` with its
    styles in `ktDoc.css`. `ktInteract.ts` wires its search, map and jumps, `ktDetailPdf.ts`
    writes its PDF and `ktHtml.ts` the one-file interactive page.
  - Ask, Settings, Tour (the first-time walkthrough), and the menus, sign-in, project list
    and help around them.
- `src/lib/aiJobs.ts` keeps AI runs going when you leave a screen, and runs "explain all"
  one request at a time.
- `src/shortcuts.ts` lists what keyboard shortcuts can do (the keys are set in Settings).
- `src/styles/` has the colours and type shared by every screen, in dark and light themes.

## License

Looma is created by [Vardaan Shukla](https://github.com/VardaanShukla) and released under the [Apache License 2.0](LICENSE). Copies and forks must keep the [NOTICE](NOTICE) file with that credit.
