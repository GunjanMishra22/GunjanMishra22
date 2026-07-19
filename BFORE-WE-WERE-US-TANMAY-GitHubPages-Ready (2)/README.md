# Before We Were Us — offline novel app

A standalone, offline-first Progressive Web App version of your novel editor.
No Claude, no backend, no external services, no internet required after the
first visit. Runs entirely in your browser, saves entirely on your device
(IndexedDB), installable to your home screen on phone or desktop.

---

## 1. Deploy to GitHub Pages (5 minutes)

1. Create a new **public** repository on GitHub (e.g. `my-novel`).
2. Upload every file and folder from this zip into the repository root —
   keep the folder structure exactly as it is (`fonts/`, `icons/`,
   `index.html`, `app.js`, etc. all at the top level, not nested in a
   subfolder).
3. In the repo, go to **Settings → Pages**.
4. Under "Build and deployment", set **Source: Deploy from a branch**,
   branch **main**, folder **/ (root)**. Save.
5. Wait a minute, then GitHub gives you a URL like
   `https://yourusername.github.io/my-novel/`. That's your permanent app.

That's it — no build step, no npm install, nothing else required. Every
file here is already production-ready, plain HTML/CSS/JS.

**Important:** don't just double-click `index.html` on your computer to
test it. Browsers block ES modules and Service Workers on the `file://`
protocol for security reasons — it has to be served over `http(s)`, which
GitHub Pages does automatically. If you want to test locally first, run
`python3 -m http.server` inside the folder and open
`http://localhost:8000`.

## 2. Bringing your existing novel in (read this — it matters)

This is the one thing that **can't** be fully automatic, for a real
technical reason: your current novel lives inside Claude's storage system,
which is a separate, closed system with no connection to this new
website — nothing hosted outside Claude can reach into it, by design
(that's a deliberate security boundary, not a bug).

So the first time you open this app, it will ask you directly:
**"Is there an existing novel to bring in, or are you starting fresh?"**

To bring your book over:
1. In the current Claude version, use **☰ → Download backup** (or
   **Copy as text** if the download doesn't work on your device) to get
   your full novel as JSON.
2. Open this new app for the first time.
3. Either upload that `.json` file, or paste the copied text, into the
   welcome screen.
4. Your entire book — every chapter, image, letter, cover setting,
   formatting choice — loads in immediately.

Do this once, on one device. After that, this app is self-contained:
everything lives in that browser's IndexedDB, works offline, and follows
normal PWA install behavior (installing on your phone's home screen
still shares the same browser storage as long as you install from the
same browser you did the import in).

**If you use this on more than one device** (phone + laptop), you'll need
to repeat the import step once per device — same as before, this app has
no server to sync between devices for you. Use **Download backup**
periodically as your safety net, exactly as you were already doing.

## 3. What's included

- **Every feature from the Claude version**: cover design with
  draggable/resizable/rotatable title, subtitle(s), and photo; material
  and pastel cover options; title page; two blank letter pages; dedication;
  table of contents; chapters made of scenes (text or image); rich text
  formatting (bold/italic/underline/strike/align/font/size/colors/
  highlights/metallic); Parts with mood-color washes; wax seal and other
  page decorations; soundtrack page; ribbon bookmark; word counts;
  last-page bookmark; sidebar chapter/scene management.
- **Export**: JSON (full backup), Markdown, plain text, HTML (fully
  self-contained, images included), EPUB (a real, validated `.epub` file
  you can open in any e-reader), and PDF (via your browser's native
  print-to-PDF, triggered from an Export button — no bundled PDF library
  needed).
- **Import**: JSON file upload or pasted text, with validation — if the
  file is broken or not a real backup, you get a clear error instead of a
  silent failure or a wiped book.
- **Offline**: a Service Worker caches every file the app needs (HTML,
  CSS, JS, fonts, icons) on first visit. After that, turn on airplane
  mode and it still opens and works fully, including writing and saving
  (IndexedDB is local to your device, no network involved).
- **Installable**: Add to Home Screen on Android/desktop via the in-app
  install button; on iPhone/iPad, use Safari's Share → Add to Home Screen
  (iOS doesn't allow apps to trigger this automatically — Apple restricts
  that, not something I can route around).
- **Autosave**: every change saves automatically about half a second
  after you stop typing, straight to IndexedDB, with a live "Saving…" /
  "Saved" indicator — no save button anywhere. It also keeps the last 10
  automatic timestamped backups inside IndexedDB itself as an extra
  safety net, separate from your manual downloaded backups.

## 4. About the fonts

The original version used Google Fonts (Playfair Display, EB Garamond,
Caveat, Inter) loaded from Google's CDN. Per your "no external
dependencies" requirement, this version doesn't call out to Google Fonts
at all — everything is bundled locally in `/fonts`. I wasn't able to
fetch the exact Google-hosted files from the environment I built this in
(no network access to Google's font CDN), so I've shipped closely-matched,
permissively-licensed (SIL Open Font License) alternatives instead:
Crimson Pro in place of Playfair Display, Libre Baskerville in place of EB
Garamond, a handwritten script in place of Caveat, and Work Sans in place
of Inter. Lora — used for your body text — is the exact original font.

If you'd like the *exact* original Google fonts instead, it's a drop-in
swap: download the `.woff`/`.woff2` files for Playfair Display, EB
Garamond, Caveat, and Inter from Google Fonts yourself, put them in
`/fonts`, and update the `src:` paths in the `@font-face` rules at the top
of `styles.css` to match your filenames. No other code changes needed.

## 5. Updating the app later

If you (or I, in a future session) change any file, bump `CACHE_VERSION`
at the top of `sw.js` (e.g. `"novel-app-v1"` → `"novel-app-v2"`) before
redeploying. That's what tells the Service Worker to fetch the new files
instead of serving the old cached ones to returning visitors.

## 6. File structure

```
index.html          the app shell
app.js               all application logic (rendering, state, editing)
db.js                IndexedDB persistence layer
export.js             export/import + hand-written EPUB/ZIP builder
styles.css            all styling
manifest.json         PWA manifest
sw.js                 Service Worker (offline caching)
/fonts                self-hosted font files + their OFL licenses
/icons                app icons (192, 512, maskable, apple-touch, favicon)
```
