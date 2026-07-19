// app.js — the entire novel-writing application, vanilla JS, no framework,
// no build step, no external libraries. Talks to IndexedDB via db.js and
// handles export/import via export.js.

import * as DB from "./db.js";
import * as EXP from "./export.js";

/* ================= constants ================= */

const COVER_PATTERNS = {
  blush:    { name: "Blush",    css: "linear-gradient(160deg,#f3d6d9 0%,#e8b7bd 45%,#d9a3ae 100%)", dark: false },
  lavender: { name: "Lavender", css: "linear-gradient(160deg,#e7dcf5 0%,#cfc0e8 45%,#b9aad9 100%)", dark: false },
  sage:     { name: "Sage",     css: "linear-gradient(160deg,#e3ead9 0%,#c9d8bd 45%,#aec7a4 100%)", dark: false },
  peach:    { name: "Peach",    css: "linear-gradient(160deg,#fbe3d4 0%,#f3c7ab 45%,#e6ab8a 100%)", dark: false },
  dusk:     { name: "Dusk",     css: "linear-gradient(160deg,#dcd6f0 0%,#c3b8dd 45%,#9c8fc2 100%)", dark: false },
  leather:  { name: "Leather",  css: "linear-gradient(160deg,#7a5540 0%,#5c3d2e 45%,#432a20 100%)", dark: true },
  kraft:    { name: "Kraft",    css: "linear-gradient(160deg,#cba876 0%,#b28f5c 45%,#96764a 100%)", dark: true },
  linen:    { name: "Linen",    css: "linear-gradient(160deg,#f1efe4 0%,#e3e0d0 45%,#d3cfba 100%)", dark: false },
};
const COVER_FONTS = [
  { label: "Display Serif", value: "'Display Serif', Georgia, serif" },
  { label: "Garamond-style", value: "'Garamond Style', Georgia, serif" },
  { label: "Handwritten", value: "'Handwritten', cursive" },
  { label: "Classic Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Clean", value: "'Inter', system-ui, sans-serif" },
];
const EDITOR_FONTS = [
  { label: "Lora", value: "Lora" },
  { label: "Display Serif", value: "Display Serif" },
  { label: "Garamond-style", value: "Garamond Style" },
  { label: "Handwritten", value: "Handwritten" },
  { label: "Clean", value: "Inter" },
];
const HIGHLIGHT_COLORS = [
  { label: "None", value: "transparent" },
  { label: "Butter", value: "#fdf1b8" },
  { label: "Blush", value: "#f7d9e3" },
  { label: "Lilac", value: "#e3dbf5" },
  { label: "Mint", value: "#d8ecd8" },
  { label: "Peach", value: "#ffe3c9" },
];
const TEXT_COLORS = ["#40323a", "#8a5a4a", "#4a6741", "#3a4a6b", "#7a3a5a", "#c9a66b"];
const DECORATION_TYPES = ["seal", "flower", "ribbon", "heart", "star"];

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
function hexWithAlpha(hex, alpha) {
  if (!hex) return `rgba(0,0,0,${alpha})`;
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function esc(s) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function countWords(str) { const t = (str || "").trim(); return t ? t.split(/\s+/).length : 0; }

function defaultBook() {
  return {
    id: uid(),
    title: "My Novel",
    subtitle: "",
    subtitle2: "",
    author: "",
    coverType: "pattern",
    coverPattern: "blush",
    coverImage: null,
    coverAlign: "center",
    coverFont: COVER_FONTS[0].value,
    coverTitlePos: { x: 50, y: 40, scale: 1, rotate: 0 },
    coverSubtitlePos: { x: 50, y: 54, scale: 1, rotate: 0 },
    coverSubtitle2Pos: { x: 50, y: 62, scale: 1, rotate: 0 },
    coverPhoto: null,
    showSubtitleOnCover: false,
    showSubtitle2OnCover: false,
    titlePagePos: { x: 50, y: 40, scale: 1, rotate: 0 },
    titleSubtitlePos: { x: 50, y: 54, scale: 1, rotate: 0 },
    titleSubtitle2Pos: { x: 50, y: 62, scale: 1, rotate: 0 },
    titlePageBg: null,
    showTitleOnTitlePage: true,
    showSubtitleOnTitlePage: true,
    showSubtitle2OnTitlePage: false,
    letterOne: "",
    letterTwo: "",
    letterOneFont: null, letterOneFontSize: null,
    letterTwoFont: null, letterTwoFontSize: null,
    parts: [
      { id: "p1", name: "How We Met", color: "#f7d9e3" },
      { id: "p2", name: "What Went Unsaid", color: "#d8cfe8" },
      { id: "p3", name: "Where Things Stand Now", color: "#f2d688" },
    ],
    decorations: {},
    soundtrack: [],
    lastPageIndex: 0,
    bookmarkColor: "#c9a66b",
    dedication: "",
    dedicationFont: null, dedicationFontSize: null,
    backNote: "",
    backNoteFont: null, backNoteFontSize: null,
    chapters: [
      { id: uid(), title: "Chapter One", partId: "p1", blocks: [{ id: uid(), type: "text", content: "" }] },
    ],
  };
}

/* ================= global state ================= */

const S = {
  book: null,
  pageIndex: 0,
  mode: "read", // read | edit
  sidebarOpen: false,
  coverEditorOpen: false,
  partsEditorOpen: false,
  textBackupOpen: false,
  exportMenuOpen: false,
  activePath: null, // {kind:'scene',ci,bi} | {kind:'letter',which} | {kind:'dedication'} | {kind:'backNote'}
  activeEditorEl: null,
  decorateMenuOpen: false,
  saveStatus: "idle",
  loaded: false,
};

let saveTimer = null;
let bookmarkTimer = null;
let pages = [];
let chapterPageMap = {};
let frontMatterMap = {};

/* ================= persistence ================= */

async function loadInitial() {
  let b = await DB.migrateFromLegacyIfNeeded();
  if (!b) b = await DB.getBook();
  if (!b) {
    // First launch on this device/browser: nothing in IndexedDB yet.
    // Don't silently create a blank/sample book — ask whether the person
    // has an existing novel (exported from the old Claude version, or a
    // previous install of this app) to bring in first.
    S.needsFirstRunChoice = true;
    S.loaded = true;
    return;
  }
  b = EXP.mergeWithDefaults(b, defaultBook);
  S.book = b;
  S.pageIndex = b.lastPageIndex || 0;
  S.loaded = true;
}

async function finishFirstRun(book) {
  const merged = book ? EXP.mergeWithDefaults(book, defaultBook) : defaultBook();
  S.book = merged;
  S.pageIndex = merged.lastPageIndex || 0;
  S.needsFirstRunChoice = false;
  await DB.saveBook(S.book);
  render();
}

function scheduleSave() {
  S.saveStatus = "saving";
  updateSaveIndicator();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await DB.saveBook(S.book);
    await DB.pushAutoBackup(S.book);
    S.saveStatus = "saved";
    updateSaveIndicator();
  }, 500);
}

function scheduleBookmarkSave() {
  clearTimeout(bookmarkTimer);
  bookmarkTimer = setTimeout(() => {
    S.book.lastPageIndex = S.pageIndex;
    scheduleSave();
  }, 500);
}

// mutate book, persist, and re-render chrome + stage (structural change)
function update(fn, opts = {}) {
  fn(S.book);
  scheduleSave();
  recomputePages();
  if (!opts.silent) render();
}

// mutate book silently (typing) - persist but don't rebuild DOM
function updateSilent(fn) {
  fn(S.book);
  scheduleSave();
}

/* ================= page model ================= */

function buildPages(book) {
  const out = [];
  const cMap = {};
  const fMap = {};
  out.push({ type: "cover-front", key: "cover-front" }); fMap.cover = out.length - 1;
  out.push({ type: "title", key: "title" }); fMap.title = out.length - 1;
  out.push({ type: "letter", which: 1, key: "letter1" }); fMap.letter1 = out.length - 1;
  out.push({ type: "letter", which: 2, key: "letter2" }); fMap.letter2 = out.length - 1;
  out.push({ type: "dedication", key: "dedication" }); fMap.dedication = out.length - 1;
  out.push({ type: "toc", key: "toc" }); fMap.toc = out.length - 1;
  book.chapters.forEach((ch, ci) => {
    cMap[ci] = out.length;
    out.push({ type: "chapter-title", chapterIndex: ci, key: "ct-" + ch.id });
    ch.blocks.forEach((b, bi) => {
      out.push({ type: b.type, chapterIndex: ci, blockIndex: bi, key: b.type + "-" + b.id });
    });
  });
  out.push({ type: "soundtrack", key: "soundtrack" }); fMap.soundtrack = out.length - 1;
  out.push({ type: "cover-back", key: "cover-back" });
  return { pages: out, chapterPageMap: cMap, frontMatterMap: fMap };
}

function recomputePages() {
  const r = buildPages(S.book);
  pages = r.pages; chapterPageMap = r.chapterPageMap; frontMatterMap = r.frontMatterMap;
  if (S.pageIndex > pages.length - 1) S.pageIndex = pages.length - 1;
}

function chapterWordCount(ch) {
  return (ch.blocks || []).reduce((n, b) => n + (b.type === "text" ? countWords(EXP.stripHtml(b.content)) : 0), 0);
}
function totalWordCount() {
  return S.book.chapters.reduce((n, ch) => n + chapterWordCount(ch), 0);
}

/* ================= drag / resize / rotate ================= */

// attaches drag+resize+rotate handles to `el` (already positioned absolute
// inside `containerEl`), calling onChange({x,y,scale,rotate}) on updates.
function makeDraggable(el, pos, containerEl, editable, onChange) {
  el.style.position = "absolute";
  el.style.left = pos.x + "%";
  el.style.top = pos.y + "%";
  el.style.transform = `translate(-50%,-50%) rotate(${pos.rotate || 0}deg) scale(${pos.scale || 1})`;
  el.style.touchAction = editable ? "none" : "auto";
  el.style.cursor = editable ? "grab" : "default";
  if (!editable) return;

  function toPercent(clientX, clientY) {
    const rect = containerEl.getBoundingClientRect();
    return {
      x: Math.min(94, Math.max(6, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.min(94, Math.max(6, ((clientY - rect.top) / rect.height) * 100)),
    };
  }

  el.addEventListener("pointerdown", (e) => {
    if (e.target.closest("[data-handle]")) return; // handles manage their own drag
    e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const { x, y } = toPercent(ev.clientX, ev.clientY);
      pos.x = x; pos.y = y;
      el.style.left = x + "%"; el.style.top = y + "%";
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onChange({ ...pos });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });

  const resizeHandle = el.querySelector("[data-handle='resize']");
  if (resizeHandle) {
    resizeHandle.addEventListener("pointerdown", (e) => {
      e.stopPropagation(); e.preventDefault();
      resizeHandle.setPointerCapture(e.pointerId);
      const startY = e.clientY;
      const startScale = pos.scale || 1;
      const move = (ev) => {
        const scale = Math.min(3, Math.max(0.5, startScale + (startY - ev.clientY) / 150));
        pos.scale = scale;
        el.style.transform = `translate(-50%,-50%) rotate(${pos.rotate || 0}deg) scale(${scale})`;
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        onChange({ ...pos });
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
  }

  const rotateHandle = el.querySelector("[data-handle='rotate']");
  if (rotateHandle) {
    rotateHandle.addEventListener("pointerdown", (e) => {
      e.stopPropagation(); e.preventDefault();
      rotateHandle.setPointerCapture(e.pointerId);
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      const move = (ev) => {
        let angle = Math.atan2(ev.clientY - cy, ev.clientX - cx) * (180 / Math.PI) + 90;
        pos.rotate = Math.round(angle);
        el.style.transform = `translate(-50%,-50%) rotate(${pos.rotate}deg) scale(${pos.scale || 1})`;
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        onChange({ ...pos });
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
  }
}

function handlesHtml(editable) {
  if (!editable) return "";
  return `
    <div data-handle="resize" style="position:absolute;right:-16px;bottom:-16px;width:24px;height:24px;border-radius:50%;background:#c9a66b;border:2px solid #fff;display:flex;align-items:center;justify-content:center;cursor:nwse-resize;box-shadow:0 2px 6px rgba(0,0,0,.25);">&#8663;</div>
    <div data-handle="rotate" style="position:absolute;left:50%;top:-32px;transform:translateX(-50%);width:24px;height:24px;border-radius:50%;background:#5a3d47;border:2px solid #fff;display:flex;align-items:center;justify-content:center;cursor:grab;box-shadow:0 2px 6px rgba(0,0,0,.25);">&#8635;</div>`;
}

/* ================= rich text editor ================= */

function makeRichEditor(container, { html, placeholder, fontFamily, fontSize, onFocus, onInput }) {
  container.innerHTML = "";
  const div = document.createElement("div");
  div.contentEditable = "true";
  div.className = "rich-editor";
  div.dataset.placeholder = placeholder || "Write here...";
  div.style.fontFamily = fontFamily ? `'${fontFamily}', Georgia, serif` : "Georgia, serif";
  div.style.fontSize = (fontSize || 15.5) + "px";
  div.innerHTML = html || "";
  div.addEventListener("focus", () => onFocus(div));
  div.addEventListener("input", () => onInput(div.innerHTML));
  container.appendChild(div);
  return div;
}

function currentFieldGetSet(path) {
  if (!path) return null;
  if (path.kind === "scene") {
    const block = S.book.chapters[path.ci].blocks[path.bi];
    return {
      get: (k) => block[k],
      set: (k, v) => { block[k] = v; },
    };
  }
  if (path.kind === "letter") {
    const prefix = path.which === 1 ? "letterOne" : "letterTwo";
    return {
      get: (k) => (k === "content" ? S.book[prefix] : S.book[prefix + (k === "fontFamily" ? "Font" : "FontSize")]),
      set: (k, v) => { S.book[k === "content" ? prefix : prefix + (k === "fontFamily" ? "Font" : "FontSize")] = v; },
    };
  }
  if (path.kind === "dedication") {
    return {
      get: (k) => (k === "content" ? S.book.dedication : k === "fontFamily" ? S.book.dedicationFont : S.book.dedicationFontSize),
      set: (k, v) => { S.book[k === "content" ? "dedication" : k === "fontFamily" ? "dedicationFont" : "dedicationFontSize"] = v; },
    };
  }
  if (path.kind === "backNote") {
    return {
      get: (k) => (k === "content" ? S.book.backNote : k === "fontFamily" ? S.book.backNoteFont : S.book.backNoteFontSize),
      set: (k, v) => { S.book[k === "content" ? "backNote" : k === "fontFamily" ? "backNoteFont" : "backNoteFontSize"] = v; },
    };
  }
  return null;
}

function mountToolbarIfNeeded() {
  const bar = document.getElementById("formatting-toolbar");
  const shouldShow = S.mode === "edit" && S.activePath &&
    ["text", "letter", "dedication", "cover-back"].includes(pages[S.pageIndex]?.type);
  if (!shouldShow) { bar.classList.add("hidden"); return; }
  bar.classList.remove("hidden");
  const fs = currentFieldGetSet(S.activePath);
  if (!fs) return;
  const font = fs.get("fontFamily") || "Georgia, serif";
  const size = fs.get("fontSize") || 15.5;

  bar.innerHTML = `
    <div class="toolbar-row">
      <span class="toolbar-label">Font</span>
      ${EDITOR_FONTS.map((f) => `<button class="pill-btn ${font === f.value ? "active" : ""}" data-font="${esc(f.value)}" style="font-family:${f.value}">${f.label}</button>`).join("")}
      <span class="toolbar-label">Size</span>
      ${[13, 15.5, 18, 22].map((s) => `<button class="pill-btn round ${size === s ? "active" : ""}" data-size="${s}">${s === 13 ? "S" : s === 15.5 ? "M" : s === 18 ? "L" : "XL"}</button>`).join("")}
    </div>
    <div class="toolbar-row">
      <button class="icon-btn" data-cmd="bold"><b>B</b></button>
      <button class="icon-btn" data-cmd="italic"><i>I</i></button>
      <button class="icon-btn" data-cmd="underline"><u>U</u></button>
      <button class="icon-btn" data-cmd="strikeThrough"><s>S</s></button>
      <div class="sep"></div>
      <button class="icon-btn" data-cmd="justifyLeft">&#8676;</button>
      <button class="icon-btn" data-cmd="justifyCenter">&#8596;</button>
      <button class="icon-btn" data-cmd="justifyRight">&#8677;</button>
      <button class="icon-btn" data-cmd="justifyFull">&#9776;</button>
      <div class="sep"></div>
      ${TEXT_COLORS.map((c) => `<button class="swatch" data-color="${c}" style="background:${c}"></button>`).join("")}
      <div class="sep"></div>
      ${HIGHLIGHT_COLORS.map((c) => `<button class="swatch" data-hilite="${c.value}" style="background:${c.value === "transparent" ? "#fff" : c.value}">${c.value === "transparent" ? "&times;" : ""}</button>`).join("")}
      <div class="sep"></div>
      <button class="icon-btn" data-cmd="metallic" title="Metallic gold text">&#10024;</button>
      <button class="icon-btn" data-cmd="removeFormat" title="Clear formatting">&#9099;</button>
    </div>`;

  bar.querySelectorAll("[data-font]").forEach((b) => b.addEventListener("click", () => {
    fs.set("fontFamily", b.dataset.font);
    scheduleSave();
    mountToolbarIfNeeded();
    if (S.activeEditorEl) S.activeEditorEl.style.fontFamily = `'${b.dataset.font}', Georgia, serif`;
  }));
  bar.querySelectorAll("[data-size]").forEach((b) => b.addEventListener("click", () => {
    const s = parseFloat(b.dataset.size);
    fs.set("fontSize", s);
    scheduleSave();
    mountToolbarIfNeeded();
    if (S.activeEditorEl) S.activeEditorEl.style.fontSize = s + "px";
  }));
  bar.querySelectorAll("[data-cmd]").forEach((b) => b.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const el = S.activeEditorEl;
    if (!el) return;
    el.focus();
    if (b.dataset.cmd === "metallic") {
      const sel = window.getSelection();
      if (sel && sel.rangeCount && !sel.isCollapsed) {
        const text = sel.toString();
        document.execCommand("insertHTML", false, `<span style="background-image:linear-gradient(120deg,#8a6d1f,#f2d688,#8a6d1f);-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:600;">${esc(text)}</span>`);
      }
    } else {
      document.execCommand(b.dataset.cmd, false, null);
    }
    fs.set("content", el.innerHTML);
    scheduleSave();
  }));
  bar.querySelectorAll("[data-color]").forEach((b) => b.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const el = S.activeEditorEl; if (!el) return;
    el.focus();
    document.execCommand("foreColor", false, b.dataset.color);
    fs.set("content", el.innerHTML);
    scheduleSave();
  }));
  bar.querySelectorAll("[data-hilite]").forEach((b) => b.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const el = S.activeEditorEl; if (!el) return;
    el.focus();
    try { document.execCommand("hiliteColor", false, b.dataset.hilite); }
    catch (err) { document.execCommand("backColor", false, b.dataset.hilite); }
    fs.set("content", el.innerHTML);
    scheduleSave();
  }));
}

/* ================= page rendering ================= */

function pageChromeStyle(tint) {
  const tintLayer = tint
    ? `linear-gradient(180deg, ${hexWithAlpha(tint, 0.28)} 0%, ${hexWithAlpha(tint, 0.08)} 30%, rgba(0,0,0,0) 65%)`
    : "linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,0))";
  return `background-color:#fbf7f0;background-image:repeating-linear-gradient(0deg, rgba(0,0,0,.012) 0px, rgba(0,0,0,.012) 1px, transparent 1px, transparent 3px), ${tintLayer};box-shadow:inset 0 0 40px rgba(120,90,90,.06);color:#40323a;`;
}

function renderDecorationInner(type, book) {
  if (type === "seal") {
    return `<div style="width:44px;height:44px;border-radius:50%;background:radial-gradient(circle at 35% 30%, #b3453f, #7a2620 72%);box-shadow:0 3px 6px rgba(0,0,0,.35), inset 0 -3px 4px rgba(0,0,0,.3), inset 0 2px 3px rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;"><span style="color:rgba(255,255,255,.55);font-family:Georgia,serif;font-size:16px;font-weight:700;">${esc((book.title || "B").trim().charAt(0).toUpperCase())}</span></div>`;
  }
  const map = { flower: "🌸", ribbon: "🎀", heart: "💕", star: "✨" };
  return `<span style="font-size:38px;filter:drop-shadow(0 3px 5px rgba(0,0,0,.25));">${map[type]}</span>`;
}

function chapterPartTint(ci) {
  const ch = S.book.chapters[ci];
  const part = S.book.parts.find((p) => p.id === ch.partId) || S.book.parts[0];
  return part ? part.color : null;
}

function renderPageInto(container, page, idx) {
  container.innerHTML = "";
  container.dataset.pageKey = page.key;
  if (!page) return;

  const chrome = document.createElement("div");
  chrome.className = "page-chrome";
  container.appendChild(chrome);

  switch (page.type) {
    case "cover-front": renderCover(chrome, true); return;
    case "cover-back": renderCover(chrome, false); return;
    case "title": renderTitlePage(chrome); return;
    case "letter": renderLetterPage(chrome, page.which); return;
    case "dedication": renderDedicationPage(chrome); return;
    case "toc": renderTocPage(chrome); return;
    case "chapter-title": renderChapterTitlePage(chrome, page.chapterIndex); return;
    case "text": renderScenePage(chrome, page.chapterIndex, page.blockIndex, idx); return;
    case "image": renderImagePage(chrome, page.chapterIndex, page.blockIndex, idx); return;
    case "soundtrack": renderSoundtrackPage(chrome); return;
  }
}

function renderCover(chrome, front) {
  const book = S.book;
  const patt = COVER_PATTERNS[book.coverPattern] || COVER_PATTERNS.blush;
  const bg = book.coverType === "image" && book.coverImage ? `url(${book.coverImage}) center/cover no-repeat` : patt.css;
  const editable = S.mode === "edit";

  if (!front) {
    chrome.style.cssText = `position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 32px;background:${bg};box-shadow:inset 0 0 60px rgba(0,0,0,.15);`;
    chrome.innerHTML = `<div style="position:absolute;inset:10px;border:1px solid rgba(255,255,255,.55);"></div>
      <div style="width:100%;max-height:70%;overflow:auto;" class="scroll-contain" id="backnote-wrap"></div>`;
    const wrap = chrome.querySelector("#backnote-wrap");
    if (editable) {
      const ed = makeRichEditor(wrap, {
        html: book.backNote, placeholder: "A closing note for the back cover...",
        fontFamily: book.backNoteFont, fontSize: book.backNoteFontSize || 13,
        onFocus: (el) => { S.activeEditorEl = el; S.activePath = { kind: "backNote" }; mountToolbarIfNeeded(); layoutStage(); },
        onInput: (html) => updateSilent((b) => { b.backNote = html; }),
      });
      ed.style.textAlign = "center"; ed.style.color = "#4a3339";
    } else {
      wrap.innerHTML = book.backNote
        ? `<div style="font-family:${book.backNoteFont ? `'${book.backNoteFont}',Georgia,serif` : "Georgia,serif"};font-style:italic;font-size:${book.backNoteFontSize || 13}px;text-align:center;color:#4a3339;">${book.backNote}</div>`
        : `<div style="text-align:center;color:rgba(74,51,57,.5);font-style:italic;font-size:13px;">A closing note for the back cover...</div>`;
    }
    return;
  }

  const isDark = book.coverType === "pattern" && patt.dark;
  const titleColor = isDark ? "#f5ede0" : "#3f2a30";
  const subColor = isDark ? "#e8ddc9" : "#4a3339";
  chrome.style.cssText = `position:absolute;inset:0;background:${bg};box-shadow:inset 0 0 60px rgba(0,0,0,.15);overflow:hidden;`;
  chrome.id = "cover-front-container";
  chrome.innerHTML = `
    <div style="position:absolute;inset:10px;border:1px solid rgba(255,255,255,.55);pointer-events:none;"></div>
    <div style="position:absolute;top:8%;left:50%;transform:translateX(-50%);letter-spacing:3px;font-size:11px;color:${isDark ? "rgba(245,237,224,.6)" : "rgba(60,40,45,.65)"};">A NOVEL</div>
    <div id="cover-title-el"></div>
    ${book.showSubtitleOnCover && book.subtitle ? `<div id="cover-sub1-el"></div>` : ""}
    ${book.showSubtitle2OnCover && book.subtitle2 ? `<div id="cover-sub2-el"></div>` : ""}
    <div style="position:absolute;bottom:9%;left:50%;transform:translateX(-50%);font-size:12px;letter-spacing:2px;color:${subColor};">${esc((book.author || "").toUpperCase())}</div>
    ${book.coverPhoto ? `<div id="cover-photo-el"></div>` : ""}
    ${editable ? `
      <button id="style-btn" style="position:absolute;bottom:12px;left:12px;display:flex;align-items:center;gap:4px;padding:6px 12px;border-radius:999px;font-size:11px;background:rgba(255,255,255,.8);color:#5a3d47;border:none;">&#127912; Style</button>
      ${!book.coverPhoto ? `<button id="add-photo-btn" style="position:absolute;bottom:12px;right:12px;display:flex;align-items:center;gap:4px;padding:6px 12px;border-radius:999px;font-size:11px;background:rgba(255,255,255,.8);color:#5a3d47;border:none;">&#128247; Add photo</button>` : ""}
    ` : ""}`;

  const titleEl = chrome.querySelector("#cover-title-el");
  titleEl.innerHTML = `<div style="font-family:${book.coverFont};font-size:30px;font-weight:700;color:${titleColor};text-shadow:${isDark ? "0 1px 3px rgba(0,0,0,.4)" : "0 1px 2px rgba(255,255,255,.3)"};white-space:pre;text-align:center;">${esc(book.title)}</div>${handlesHtml(editable)}`;
  makeDraggable(titleEl, book.coverTitlePos, chrome, editable, (p) => updateSilent((b) => { b.coverTitlePos = p; }));

  if (book.showSubtitleOnCover && book.subtitle) {
    const sub1 = chrome.querySelector("#cover-sub1-el");
    sub1.innerHTML = `<div style="font-family:${book.coverFont};font-style:italic;color:${subColor};white-space:pre;text-align:center;">${esc(book.subtitle)}</div>${handlesHtml(editable)}`;
    makeDraggable(sub1, book.coverSubtitlePos, chrome, editable, (p) => updateSilent((b) => { b.coverSubtitlePos = p; }));
  }
  if (book.showSubtitle2OnCover && book.subtitle2) {
    const sub2 = chrome.querySelector("#cover-sub2-el");
    sub2.innerHTML = `<div style="font-family:${book.coverFont};font-style:italic;color:${subColor};white-space:pre;text-align:center;">${esc(book.subtitle2)}</div>${handlesHtml(editable)}`;
    makeDraggable(sub2, book.coverSubtitle2Pos, chrome, editable, (p) => updateSilent((b) => { b.coverSubtitle2Pos = p; }));
  }
  if (book.coverPhoto) {
    const photoEl = chrome.querySelector("#cover-photo-el");
    photoEl.innerHTML = `<div style="position:relative;"><img src="${book.coverPhoto.src}" style="width:110px;display:block;border-radius:6px;box-shadow:0 6px 18px rgba(0,0,0,.35);border:6px solid #fff;"/>${editable ? `<button data-remove-photo style="position:absolute;top:-10px;left:-10px;width:22px;height:22px;border-radius:50%;background:#c17a7a;color:#fff;border:2px solid #fff;">&times;</button>` : ""}</div>${handlesHtml(editable)}`;
    makeDraggable(photoEl, book.coverPhoto, chrome, editable, (p) => updateSilent((b) => { b.coverPhoto = { ...b.coverPhoto, ...p }; }));
    const rm = photoEl.querySelector("[data-remove-photo]");
    if (rm) rm.addEventListener("click", (e) => { e.stopPropagation(); update((b) => { b.coverPhoto = null; }); });
  }

  const styleBtn = chrome.querySelector("#style-btn");
  if (styleBtn) styleBtn.addEventListener("click", () => { S.coverEditorOpen = true; render(); });
  const addPhotoBtn = chrome.querySelector("#add-photo-btn");
  if (addPhotoBtn) addPhotoBtn.addEventListener("click", () => document.getElementById("cover-photo-input").click());
}

function renderTitlePage(chrome) {
  const book = S.book;
  const patt = book.titlePageBg ? COVER_PATTERNS[book.titlePageBg] : null;
  const editable = S.mode === "edit";
  chrome.style.cssText = `position:absolute;inset:0;display:flex;flex-direction:column;overflow:hidden;background:${patt ? patt.css : "#fbf7f0"};` +
    (patt ? "" : "background-image:repeating-linear-gradient(0deg, rgba(0,0,0,.012) 0px, rgba(0,0,0,.012) 1px, transparent 1px, transparent 3px);");
  chrome.innerHTML = `
    ${book.showTitleOnTitlePage ? `<div id="tp-title-el"></div>` : ""}
    ${book.showSubtitleOnTitlePage && book.subtitle ? `<div id="tp-sub1-el"></div>` : ""}
    ${book.showSubtitle2OnTitlePage && book.subtitle2 ? `<div id="tp-sub2-el"></div>` : ""}
    <div style="position:absolute;bottom:14%;left:50%;transform:translateX(-50%);letter-spacing:2px;font-size:12px;color:#9a8890;">${esc((book.author || "").toUpperCase())}</div>
    ${editable ? `<button id="tp-style-btn" style="position:absolute;bottom:12px;left:12px;display:flex;align-items:center;gap:4px;padding:6px 12px;border-radius:999px;font-size:11px;background:rgba(255,255,255,.8);color:#5a3d47;border:none;">&#127912; Style</button>` : ""}`;

  if (book.showTitleOnTitlePage) {
    const el = chrome.querySelector("#tp-title-el");
    el.innerHTML = `<div style="text-align:center;"><div style="width:40px;height:2px;background:#c9a66b;margin:0 auto 16px;"></div><div style="font-family:${book.coverFont};font-size:28px;font-weight:700;color:#5a3d47;white-space:pre;">${esc(book.title)}</div></div>${handlesHtml(editable)}`;
    makeDraggable(el, book.titlePagePos, chrome, editable, (p) => updateSilent((b) => { b.titlePagePos = p; }));
  }
  if (book.showSubtitleOnTitlePage && book.subtitle) {
    const el = chrome.querySelector("#tp-sub1-el");
    el.innerHTML = `<div style="font-family:${book.coverFont};font-style:italic;color:#8a7178;white-space:pre;text-align:center;">${esc(book.subtitle)}</div>${handlesHtml(editable)}`;
    makeDraggable(el, book.titleSubtitlePos, chrome, editable, (p) => updateSilent((b) => { b.titleSubtitlePos = p; }));
  }
  if (book.showSubtitle2OnTitlePage && book.subtitle2) {
    const el = chrome.querySelector("#tp-sub2-el");
    el.innerHTML = `<div style="font-family:${book.coverFont};font-style:italic;color:#8a7178;white-space:pre;text-align:center;">${esc(book.subtitle2)}</div>${handlesHtml(editable)}`;
    makeDraggable(el, book.titleSubtitle2Pos, chrome, editable, (p) => updateSilent((b) => { b.titleSubtitle2Pos = p; }));
  }
  const styleBtn = chrome.querySelector("#tp-style-btn");
  if (styleBtn) styleBtn.addEventListener("click", () => { S.coverEditorOpen = true; render(); });
}

function renderLetterPage(chrome, which) {
  const book = S.book;
  const contentKey = which === 1 ? "letterOne" : "letterTwo";
  const fontKey = which === 1 ? "letterOneFont" : "letterTwoFont";
  const sizeKey = which === 1 ? "letterOneFontSize" : "letterTwoFontSize";
  chrome.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;" + pageChromeStyle(null);
  chrome.innerHTML = `<div class="page-scroll" id="letter-wrap"></div><div class="page-number">${S.pageIndex + 1}</div>`;
  const wrap = chrome.querySelector("#letter-wrap");
  if (S.mode === "edit") {
    const ed = makeRichEditor(wrap, {
      html: book[contentKey], placeholder: "Write your letter...",
      fontFamily: book[fontKey], fontSize: book[sizeKey],
      onFocus: (el) => { S.activeEditorEl = el; S.activePath = { kind: "letter", which }; mountToolbarIfNeeded(); layoutStage(); },
      onInput: (html) => updateSilent((b) => { b[contentKey] = html; }),
    });
  } else {
    wrap.innerHTML = book[contentKey]
      ? `<div style="font-family:${book[fontKey] ? `'${book[fontKey]}',Georgia,serif` : "Georgia,serif"};font-size:${book[sizeKey] || 15.5}px;line-height:1.85;">${book[contentKey]}</div>`
      : `<span style="color:#c2b3ac;">This page is empty.</span>`;
  }
}

function renderDedicationPage(chrome) {
  const book = S.book;
  chrome.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:0 40px;" + pageChromeStyle(null);
  chrome.innerHTML = `<div id="ded-wrap" style="width:100%;"></div>`;
  const wrap = chrome.querySelector("#ded-wrap");
  if (S.mode === "edit") {
    const ed = makeRichEditor(wrap, {
      html: book.dedication, placeholder: "Add a dedication...",
      fontFamily: book.dedicationFont, fontSize: book.dedicationFontSize,
      onFocus: (el) => { S.activeEditorEl = el; S.activePath = { kind: "dedication" }; mountToolbarIfNeeded(); layoutStage(); },
      onInput: (html) => updateSilent((b) => { b.dedication = html; }),
    });
    ed.style.textAlign = "center";
  } else {
    wrap.innerHTML = book.dedication
      ? `<div style="font-family:${book.dedicationFont ? `'${book.dedicationFont}',Georgia,serif` : "Georgia,serif"};font-style:italic;font-size:${book.dedicationFontSize || 17}px;text-align:center;color:#5a4650;line-height:1.8;">${book.dedication}</div>`
      : `<div style="text-align:center;color:#c2b3ac;font-style:italic;">Add a dedication...</div>`;
  }
}

function renderTocPage(chrome) {
  chrome.style.cssText = "position:absolute;inset:0;" + pageChromeStyle(null);
  const items = S.book.chapters.map((ch, ci) => `
    <button class="toc-item" data-toc-ci="${ci}">
      <span style="font-size:11px;letter-spacing:1px;color:#c9a66b;margin-right:8px;">${String(ci + 1).padStart(2, "0")}</span>${esc(ch.title)}
    </button>`).join("");
  chrome.innerHTML = `<div class="page-scroll" style="padding:48px 32px;">
    <div style="font-size:22px;text-align:center;color:#5a3d47;margin-bottom:24px;font-family:Georgia,serif;">Contents</div>
    ${items}
  </div>`;
  chrome.querySelectorAll("[data-toc-ci]").forEach((b) => b.addEventListener("click", () => goTo(chapterPageMap[parseInt(b.dataset.tocCi, 10)])));
}

function renderChapterTitlePage(chrome, ci) {
  const ch = S.book.chapters[ci];
  const tint = chapterPartTint(ci);
  chrome.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 40px;" + pageChromeStyle(tint);
  chrome.innerHTML = `
    <div style="width:56px;height:56px;border-radius:50%;border:1.5px solid #c9a66b;display:flex;align-items:center;justify-content:center;color:#c9a66b;font-size:18px;margin-bottom:20px;font-family:Georgia,serif;">${ci + 1}</div>
    <div style="font-size:11px;letter-spacing:3px;color:#9a8890;margin-bottom:10px;">CHAPTER ${ci + 1}</div>
    <div id="chtitle-el"></div>`;
  const titleEl = chrome.querySelector("#chtitle-el");
  if (S.mode === "edit") {
    const input = document.createElement("textarea");
    input.value = ch.title;
    input.rows = 2;
    input.className = "plain-input";
    input.style.cssText = "text-align:center;font-family:Georgia,serif;font-size:24px;color:#5a3d47;background:transparent;border:none;resize:none;outline:none;width:100%;";
    input.addEventListener("input", () => updateSilent((b) => { b.chapters[ci].title = input.value; }));
    input.addEventListener("blur", () => { render(); });
    titleEl.appendChild(input);
  } else {
    titleEl.innerHTML = `<div style="font-family:Georgia,serif;font-size:24px;color:#5a3d47;">${esc(ch.title)}</div>`;
  }
}

function renderScenePage(chrome, ci, bi, idx) {
  const block = S.book.chapters[ci].blocks[bi];
  const tint = chapterPartTint(ci);
  chrome.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;" + pageChromeStyle(tint);
  chrome.innerHTML = `<div class="page-scroll" id="scene-wrap" style="padding:40px 36px;"></div><div class="page-number">${idx}</div>`;
  const wrap = chrome.querySelector("#scene-wrap");
  if (S.mode === "edit") {
    makeRichEditor(wrap, {
      html: block.content, placeholder: "Write this scene...",
      fontFamily: block.fontFamily, fontSize: block.fontSize,
      onFocus: (el) => { S.activeEditorEl = el; S.activePath = { kind: "scene", ci, bi }; mountToolbarIfNeeded(); layoutStage(); },
      onInput: (html) => updateSilent((b) => { b.chapters[ci].blocks[bi].content = html; }),
    });
  } else {
    wrap.innerHTML = block.content
      ? `<div style="font-family:${block.fontFamily ? `'${block.fontFamily}',Georgia,serif` : "Georgia,serif"};font-size:${block.fontSize || 15.5}px;line-height:1.85;">${block.content}</div>`
      : `<span style="color:#c2b3ac;">This page is empty.</span>`;
  }
}

function renderImagePage(chrome, ci, bi, idx) {
  const block = S.book.chapters[ci].blocks[bi];
  const tint = chapterPartTint(ci);
  chrome.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;" + pageChromeStyle(tint);
  chrome.innerHTML = `
    <div id="img-wrap" style="display:flex;flex-direction:column;align-items:center;"></div>
    <input type="file" accept="image/*" id="scene-img-input" hidden />
    <div class="page-number" style="position:absolute;bottom:12px;">${idx}</div>`;
  const wrap = chrome.querySelector("#img-wrap");
  const fileInput = chrome.querySelector("#scene-img-input");
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update((b) => { b.chapters[ci].blocks[bi].src = reader.result; });
    reader.readAsDataURL(file);
  });
  if (block.src) {
    wrap.innerHTML = `<img src="${block.src}" style="max-width:100%;max-height:60%;object-fit:contain;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.15);"/>` +
      (S.mode === "edit" ? `<button id="change-img-btn" style="margin-top:10px;font-size:11px;text-decoration:underline;color:#a68e97;background:none;border:none;">Change image</button>` : "");
    const chg = wrap.querySelector("#change-img-btn");
    if (chg) chg.addEventListener("click", () => fileInput.click());
  } else {
    wrap.innerHTML = `<button id="add-img-btn" style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:36px 24px;border:2px dashed #d9c3c9;border-radius:10px;background:none;color:#a68e97;">📷<span style="font-size:12px;">Add an image</span></button>`;
    wrap.querySelector("#add-img-btn").addEventListener("click", () => fileInput.click());
  }
  const capWrap = document.createElement("div");
  capWrap.style.marginTop = "14px"; capWrap.style.width = "100%";
  if (S.mode === "edit") {
    const cap = document.createElement("textarea");
    cap.value = block.caption || ""; cap.rows = 1; cap.placeholder = "Caption (optional)";
    cap.style.cssText = "width:100%;text-align:center;font-style:italic;font-size:13px;background:transparent;border:none;outline:none;resize:none;color:#8a7178;";
    cap.addEventListener("input", () => updateSilent((b) => { b.chapters[ci].blocks[bi].caption = cap.value; }));
    capWrap.appendChild(cap);
  } else if (block.caption) {
    capWrap.innerHTML = `<div style="text-align:center;font-style:italic;font-size:13px;color:#8a7178;">${esc(block.caption)}</div>`;
  }
  wrap.appendChild(capWrap);
}

function renderSoundtrackPage(chrome) {
  const book = S.book;
  chrome.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;" + pageChromeStyle(null);
  chrome.innerHTML = `<div class="page-scroll" id="tracks-wrap" style="padding:40px 32px;">
    <div style="font-size:20px;text-align:center;color:#5a3d47;margin-bottom:4px;font-family:Georgia,serif;">The Soundtrack</div>
    <div style="font-size:10px;letter-spacing:2px;color:#a68e97;text-align:center;margin-bottom:22px;">SONGS THAT BELONG TO THIS STORY</div>
    <div id="track-list"></div>
    ${S.mode === "edit" ? `<button id="add-track-btn" class="pill-btn" style="width:100%;margin-top:8px;">+ Add a song</button>` : ""}
  </div>`;
  const list = chrome.querySelector("#track-list");
  if (book.soundtrack.length === 0 && S.mode !== "edit") {
    list.innerHTML = `<div style="text-align:center;color:#c2b3ac;font-style:italic;font-size:13px;">No songs added yet.</div>`;
  }
  book.soundtrack.forEach((track, ti) => {
    const row = document.createElement("div");
    row.style.cssText = "margin-bottom:12px;padding-bottom:12px;border-bottom:1px dotted #d8c9c2;display:flex;gap:8px;align-items:flex-start;";
    const num = document.createElement("div");
    num.style.cssText = "font-size:11px;color:#c9a66b;width:18px;padding-top:6px;flex-shrink:0;";
    num.textContent = String(ti + 1).padStart(2, "0");
    row.appendChild(num);
    const body = document.createElement("div");
    body.style.flex = "1";
    if (S.mode === "edit") {
      body.innerHTML = `
        <input class="plain-input mb1" placeholder="Song title" value="${esc(track.title)}" data-tf="title"/>
        <input class="plain-input mb1 italic" placeholder="Artist" value="${esc(track.artist)}" data-tf="artist"/>
        <input class="plain-input" placeholder="Why this song? (optional)" value="${esc(track.note)}" data-tf="note"/>`;
      body.querySelectorAll("[data-tf]").forEach((inp) => inp.addEventListener("input", () => updateSilent((b) => { b.soundtrack[ti][inp.dataset.tf] = inp.value; })));
    } else {
      body.innerHTML = `<div style="font-weight:600;">${esc(track.title || "Untitled")}</div>${track.artist ? `<div style="font-size:12px;font-style:italic;color:#8a7178;">${esc(track.artist)}</div>` : ""}${track.note ? `<div style="font-size:12px;color:#a68e97;margin-top:2px;">${esc(track.note)}</div>` : ""}`;
    }
    row.appendChild(body);
    if (S.mode === "edit") {
      const ctrls = document.createElement("div");
      ctrls.style.cssText = "display:flex;flex-direction:column;gap:2px;flex-shrink:0;";
      ctrls.innerHTML = `<button data-up class="mini-btn">&#8593;</button><button data-down class="mini-btn">&#8595;</button><button data-del class="mini-btn">&times;</button>`;
      ctrls.querySelector("[data-up]").addEventListener("click", () => update((b) => { if (ti > 0) { const [t] = b.soundtrack.splice(ti, 1); b.soundtrack.splice(ti - 1, 0, t); } }));
      ctrls.querySelector("[data-down]").addEventListener("click", () => update((b) => { if (ti < b.soundtrack.length - 1) { const [t] = b.soundtrack.splice(ti, 1); b.soundtrack.splice(ti + 1, 0, t); } }));
      ctrls.querySelector("[data-del]").addEventListener("click", () => update((b) => { b.soundtrack.splice(ti, 1); }));
      row.appendChild(ctrls);
    }
    list.appendChild(row);
  });
  const addBtn = chrome.querySelector("#add-track-btn");
  if (addBtn) addBtn.addEventListener("click", () => update((b) => { b.soundtrack.push({ id: uid(), title: "", artist: "", note: "" }); }));
}

/* ================= decorations layer ================= */

function renderDecorations(container, pageKey) {
  const list = S.book.decorations[pageKey] || [];
  list.forEach((dec) => {
    const el = document.createElement("div");
    el.innerHTML = `<div style="position:relative;">${renderDecorationInner(dec.type, S.book)}${S.mode === "edit" ? `<button data-remove-dec style="position:absolute;top:-8px;right:-8px;width:18px;height:18px;border-radius:50%;background:#c17a7a;color:#fff;border:2px solid #fff;">&times;</button>` : ""}${handlesHtml(S.mode === "edit")}</div>`;
    container.appendChild(el);
    makeDraggable(el, dec.pos, container, S.mode === "edit", (p) => updateSilent((b) => {
      const arr = b.decorations[pageKey] || [];
      const found = arr.find((d) => d.id === dec.id);
      if (found) found.pos = p;
    }));
    const rm = el.querySelector("[data-remove-dec]");
    if (rm) rm.addEventListener("click", (e) => { e.stopPropagation(); update((b) => { b.decorations[pageKey] = (b.decorations[pageKey] || []).filter((d) => d.id !== dec.id); }); });
  });
}

/* ================= flip navigation ================= */

let flip = { active: false, dir: null, target: null };

function goTo(idx) {
  if (idx < 0 || idx > pages.length - 1 || idx === S.pageIndex || flip.active) return;
  if (Math.abs(idx - S.pageIndex) > 1) {
    S.pageIndex = idx;
    S.activePath = null; S.activeEditorEl = null; S.decorateMenuOpen = false;
    scheduleBookmarkSave();
    render();
    return;
  }
  const dir = idx > S.pageIndex ? "next" : "prev";
  flip = { active: true, dir, target: idx };
  const flipLayer = document.getElementById("flip-layer");
  const bottomLayer = document.getElementById("page-content");
  const targetPage = pages[idx];
  renderPageInto(flipLayer.querySelector(".flip-front"), pages[S.pageIndex], S.pageIndex + 1);
  flipLayer.classList.remove("hidden");
  flipLayer.style.transformOrigin = dir === "next" ? "left center" : "right center";
  flipLayer.style.transform = "rotateY(0deg)";
  // pre-render target under it
  renderPageInto(bottomLayer, targetPage, idx + 1);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    flipLayer.style.transform = dir === "next" ? "rotateY(-178deg)" : "rotateY(178deg)";
  }));
  const onEnd = () => {
    flipLayer.removeEventListener("transitionend", onEnd);
    flipLayer.classList.add("hidden");
    S.pageIndex = idx;
    S.activePath = null; S.activeEditorEl = null; S.decorateMenuOpen = false;
    scheduleBookmarkSave();
    render();
  };
  flipLayer.addEventListener("transitionend", onEnd);
}

/* ================= top-level render ================= */

function updateSaveIndicator() {
  const dot = document.getElementById("save-dot");
  const label = document.getElementById("save-label");
  if (!dot) return;
  dot.style.background = S.saveStatus === "saving" ? "#c9a66b" : "#7a9b6f";
  label.textContent = S.saveStatus === "saving" ? "Saving…" : "Saved";
  const bottomLabel = document.getElementById("bottom-save-label");
  if (bottomLabel) bottomLabel.textContent = S.saveStatus === "saving" ? "· saving…" : "· saved";
}

function layoutStage() {
  const showToolbar = S.mode === "edit" && S.activePath &&
    ["text", "letter", "dedication", "cover-back"].includes(pages[S.pageIndex]?.type);
  document.getElementById("book-stage").style.top = showToolbar ? "132px" : "72px";
}

function render() {
  if (!S.loaded) return;
  if (S.needsFirstRunChoice) {
    renderFirstRunScreen();
    return;
  }
  document.getElementById("first-run-screen").classList.add("hidden");
  recomputePages();
  renderTopBar();
  renderSidebar();
  renderStage();
  renderModals();
  mountToolbarIfNeeded();
  layoutStage();
  updateSaveIndicator();
}

function renderFirstRunScreen() {
  const el = document.getElementById("first-run-screen");
  el.classList.remove("hidden");
  if (el.dataset.wired) return; // wire event listeners only once
  el.dataset.wired = "1";

  el.querySelector("#fr-start-new").addEventListener("click", () => finishFirstRun(null));

  el.querySelector("#fr-file-btn").addEventListener("click", () => el.querySelector("#fr-file-input").click());
  el.querySelector("#fr-file-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        finishFirstRun(parsed);
      } catch (err) {
        el.querySelector("#fr-error").textContent = "That file couldn't be read. Make sure it's the .json backup file.";
      }
    };
    reader.readAsText(file);
  });

  el.querySelector("#fr-paste-btn").addEventListener("click", () => {
    const val = el.querySelector("#fr-paste-box").value;
    if (!val.trim()) { el.querySelector("#fr-error").textContent = "Paste your backup text first."; return; }
    try {
      const parsed = JSON.parse(val);
      finishFirstRun(parsed);
    } catch (err) {
      el.querySelector("#fr-error").textContent = "That doesn't look like valid backup text — make sure you copied the whole thing.";
    }
  });
}

function renderTopBar() {
  document.getElementById("top-title").textContent = (S.book.title || "").split("\n")[0];
  const modeBtn = document.getElementById("mode-btn");
  modeBtn.textContent = S.mode === "edit" ? "✓ Done" : "✎ Edit";
  modeBtn.className = "mode-btn " + (S.mode === "edit" ? "active" : "");
}

function renderStage() {
  const stage = document.getElementById("book-stage");
  const page = pages[S.pageIndex];
  document.getElementById("prev-btn").disabled = S.pageIndex === 0;
  document.getElementById("next-btn").disabled = S.pageIndex === pages.length - 1;
  document.getElementById("ribbon").style.background = S.book.bookmarkColor || "#c9a66b";
  document.getElementById("page-counter").textContent = `${S.pageIndex + 1} / ${pages.length}`;

  const content = document.getElementById("page-content");
  renderPageInto(content, page, S.pageIndex + 1);
  const decLayer = document.getElementById("decoration-layer");
  decLayer.innerHTML = "";
  renderDecorations(decLayer, page.key);

  const decBtn = document.getElementById("decorate-fab");
  decBtn.classList.toggle("hidden", S.mode !== "edit");
}

function renderSidebar() {
  const panel = document.getElementById("sidebar-panel");
  panel.classList.toggle("open", S.sidebarOpen);
  document.getElementById("sidebar-backdrop").classList.toggle("open", S.sidebarOpen);
  document.getElementById("word-count-label").textContent = `${totalWordCount().toLocaleString()} words`;

  const list = document.getElementById("chapter-list");
  list.innerHTML = "";

  const fixedLinks = [
    ["Front cover", frontMatterMap.cover],
    ["Title page", frontMatterMap.title],
    ["Letter — page 1", frontMatterMap.letter1],
    ["Letter — page 2", frontMatterMap.letter2],
    ["Dedication", frontMatterMap.dedication],
    ["Contents page", frontMatterMap.toc],
  ];
  fixedLinks.forEach(([label, idx]) => {
    const b = document.createElement("button");
    b.className = "side-link";
    b.textContent = label;
    b.addEventListener("click", () => { goTo(idx); S.sidebarOpen = false; render(); });
    list.appendChild(b);
  });

  S.book.chapters.forEach((ch, ci) => {
    const wrap = document.createElement("div");
    wrap.className = "chapter-card";
    const part = S.book.parts.find((p) => p.id === ch.partId) || S.book.parts[0];
    wrap.innerHTML = `
      <div class="chapter-row">
        <button class="part-dot" style="background:${part?.color}"></button>
        <button class="chapter-title-btn">${ci + 1}. ${esc(ch.title)} <span class="wc">${chapterWordCount(ch).toLocaleString()}w</span></button>
        ${S.mode === "edit" ? `<button class="mini-btn" data-ch-up>&#8593;</button><button class="mini-btn" data-ch-down>&#8595;</button><button class="mini-btn" data-ch-del>&times;</button>` : ""}
      </div>
      <div class="scene-list" style="padding-left:12px;"></div>`;
    wrap.querySelector(".part-dot").addEventListener("click", () => update((b) => {
      const ids = b.parts.map((p) => p.id);
      const cur = ids.indexOf(b.chapters[ci].partId);
      b.chapters[ci].partId = ids[(cur + 1) % ids.length] || ids[0];
    }));
    wrap.querySelector(".chapter-title-btn").addEventListener("click", () => { goTo(chapterPageMap[ci]); S.sidebarOpen = false; render(); });
    if (S.mode === "edit") {
      wrap.querySelector("[data-ch-up]").addEventListener("click", () => update((b) => { if (ci > 0) { const [c] = b.chapters.splice(ci, 1); b.chapters.splice(ci - 1, 0, c); } }));
      wrap.querySelector("[data-ch-down]").addEventListener("click", () => update((b) => { if (ci < b.chapters.length - 1) { const [c] = b.chapters.splice(ci, 1); b.chapters.splice(ci + 1, 0, c); } }));
      wrap.querySelector("[data-ch-del]").addEventListener("click", () => { if (confirm("Delete this chapter?")) update((b) => { b.chapters.splice(ci, 1); S.pageIndex = 0; }); });
    }
    const sceneList = wrap.querySelector(".scene-list");
    ch.blocks.forEach((bl, bi) => {
      const sb = document.createElement("div");
      sb.className = "scene-row";
      sb.innerHTML = `<button class="scene-link">${bl.type === "image" ? "🖼" : "▤"} Scene ${bi + 1}${bl.type === "image" ? " (image)" : ""}</button>
        ${S.mode === "edit" ? `<button class="mini-btn" data-sc-up>&#8593;</button><button class="mini-btn" data-sc-down>&#8595;</button><button class="mini-btn" data-sc-del>&times;</button>` : ""}`;
      sb.querySelector(".scene-link").addEventListener("click", () => {
        const pidx = pages.findIndex((p) => p.chapterIndex === ci && p.blockIndex === bi);
        goTo(pidx); S.sidebarOpen = false; render();
      });
      if (S.mode === "edit") {
        sb.querySelector("[data-sc-up]").addEventListener("click", () => update((b) => { const arr = b.chapters[ci].blocks; if (bi > 0) { const [x] = arr.splice(bi, 1); arr.splice(bi - 1, 0, x); } }));
        sb.querySelector("[data-sc-down]").addEventListener("click", () => update((b) => { const arr = b.chapters[ci].blocks; if (bi < arr.length - 1) { const [x] = arr.splice(bi, 1); arr.splice(bi + 1, 0, x); } }));
        sb.querySelector("[data-sc-del]").addEventListener("click", () => update((b) => { b.chapters[ci].blocks.splice(bi, 1); S.pageIndex = 0; }));
      }
      sceneList.appendChild(sb);
    });
    if (S.mode === "edit") {
      const addRow = document.createElement("div");
      addRow.style.cssText = "display:flex;gap:8px;margin-top:6px;";
      addRow.innerHTML = `<button class="pill-btn small">+ Text</button><button class="pill-btn small">+ Image</button>`;
      addRow.children[0].addEventListener("click", () => update((b) => { b.chapters[ci].blocks.push({ id: uid(), type: "text", content: "" }); }));
      addRow.children[1].addEventListener("click", () => update((b) => { b.chapters[ci].blocks.push({ id: uid(), type: "image", src: null, caption: "" }); }));
      sceneList.appendChild(addRow);
    }
    list.appendChild(wrap);
  });

  if (S.mode === "edit") {
    const addChapterBtn = document.createElement("button");
    addChapterBtn.className = "solid-btn";
    addChapterBtn.textContent = "+ Add chapter";
    addChapterBtn.addEventListener("click", () => update((b) => { b.chapters.push({ id: uid(), title: "New Chapter", partId: b.parts[0]?.id, blocks: [{ id: uid(), type: "text", content: "" }] }); }));
    list.appendChild(addChapterBtn);
  }

  const soundtrackLink = document.createElement("button");
  soundtrackLink.className = "side-link";
  soundtrackLink.textContent = "🎵 The Soundtrack";
  soundtrackLink.style.marginTop = "16px";
  soundtrackLink.addEventListener("click", () => { goTo(frontMatterMap.soundtrack); S.sidebarOpen = false; render(); });
  list.appendChild(soundtrackLink);

  const backLink = document.createElement("button");
  backLink.className = "side-link";
  backLink.textContent = "Back cover";
  backLink.addEventListener("click", () => { goTo(pages.length - 1); S.sidebarOpen = false; render(); });
  list.appendChild(backLink);
}

/* ================= modals ================= */

function renderModals() {
  document.getElementById("cover-editor-modal").classList.toggle("open", S.coverEditorOpen);
  document.getElementById("parts-editor-modal").classList.toggle("open", S.partsEditorOpen);
  document.getElementById("text-backup-modal").classList.toggle("open", S.textBackupOpen);
  document.getElementById("export-modal").classList.toggle("open", S.exportMenuOpen);
  if (S.coverEditorOpen) renderCoverEditor();
  if (S.partsEditorOpen) renderPartsEditor();
  if (S.textBackupOpen) renderTextBackup();
}

function renderCoverEditor() {
  const book = S.book;
  const root = document.getElementById("cover-editor-body");
  root.innerHTML = `
    <label class="field-label">Title (press enter to break lines)</label>
    <textarea id="ce-title" class="plain-input box" rows="3">${esc(book.title)}</textarea>

    <label class="field-label">Subtitle (press enter to break lines)</label>
    <textarea id="ce-sub1" class="plain-input box" rows="2">${esc(book.subtitle)}</textarea>
    <div class="row2">
      <button id="ce-sub1-cover" class="pill-btn ${book.showSubtitleOnCover ? "active" : ""}">On cover</button>
      <button id="ce-sub1-title" class="pill-btn ${book.showSubtitleOnTitlePage ? "active" : ""}">On title page</button>
    </div>

    <label class="field-label">Subtitle 2 (press enter to break lines)</label>
    <textarea id="ce-sub2" class="plain-input box" rows="2">${esc(book.subtitle2)}</textarea>
    <div class="row2">
      <button id="ce-sub2-cover" class="pill-btn ${book.showSubtitle2OnCover ? "active" : ""}">On cover</button>
      <button id="ce-sub2-title" class="pill-btn ${book.showSubtitle2OnTitlePage ? "active" : ""}">On title page</button>
    </div>

    <label class="field-label">Author name</label>
    <input id="ce-author" class="plain-input box" value="${esc(book.author)}"/>

    <button id="ce-title-toggle" class="pill-btn full ${book.showTitleOnTitlePage ? "" : "active"}">${book.showTitleOnTitlePage ? "Title showing on title page — tap to remove" : "Title removed — tap to bring it back"}</button>

    <label class="field-label">Title page background</label>
    <div class="swatch-row">
      <button class="swatch-lg ${!book.titlePageBg ? "sel" : ""}" data-tpbg="">Paper</button>
      ${Object.entries(COVER_PATTERNS).map(([k, p]) => `<button class="swatch-lg ${book.titlePageBg === k ? "sel" : ""}" data-tpbg="${k}" style="background:${p.css}"></button>`).join("")}
    </div>

    <label class="field-label">Font (cover & title page)</label>
    <div class="font-list">
      ${COVER_FONTS.map((f) => `<button class="font-opt ${book.coverFont === f.value ? "sel" : ""}" data-font="${esc(f.value)}" style="font-family:${f.value}">${f.label} — ${esc(book.title || "Your Title")}</button>`).join("")}
    </div>

    <label class="field-label">Pastel pattern</label>
    <div class="swatch-row">
      ${Object.entries(COVER_PATTERNS).map(([k, p]) => `<button class="swatch-lg ${book.coverType === "pattern" && book.coverPattern === k ? "sel" : ""}" data-pattern="${k}" style="background:${p.css}"></button>`).join("")}
    </div>

    <button id="ce-upload" class="pill-btn full ${book.coverType === "image" ? "active" : ""}">${book.coverImage ? "Change uploaded image" : "Upload your own image"}</button>

    <label class="field-label">Bookmark ribbon color</label>
    <div class="swatch-row">
      ${["#c9a66b", "#c17a7a", "#8a9b6f", "#7a8fc2", "#c28fb3", "#5a3d47"].map((c) => `<button class="swatch-lg ${book.bookmarkColor === c ? "sel" : ""}" data-ribbon="${c}" style="background:${c}"></button>`).join("")}
    </div>`;

  root.querySelector("#ce-title").addEventListener("input", (e) => updateSilent((b) => { b.title = e.target.value; }));
  root.querySelector("#ce-sub1").addEventListener("input", (e) => updateSilent((b) => { b.subtitle = e.target.value; }));
  root.querySelector("#ce-sub2").addEventListener("input", (e) => updateSilent((b) => { b.subtitle2 = e.target.value; }));
  root.querySelector("#ce-author").addEventListener("input", (e) => updateSilent((b) => { b.author = e.target.value; }));
  root.querySelector("#ce-sub1-cover").addEventListener("click", () => update((b) => { b.showSubtitleOnCover = !b.showSubtitleOnCover; }));
  root.querySelector("#ce-sub1-title").addEventListener("click", () => update((b) => { b.showSubtitleOnTitlePage = !b.showSubtitleOnTitlePage; }));
  root.querySelector("#ce-sub2-cover").addEventListener("click", () => update((b) => { b.showSubtitle2OnCover = !b.showSubtitle2OnCover; }));
  root.querySelector("#ce-sub2-title").addEventListener("click", () => update((b) => { b.showSubtitle2OnTitlePage = !b.showSubtitle2OnTitlePage; }));
  root.querySelector("#ce-title-toggle").addEventListener("click", () => update((b) => { b.showTitleOnTitlePage = !b.showTitleOnTitlePage; }));
  root.querySelectorAll("[data-tpbg]").forEach((el) => el.addEventListener("click", () => update((b) => { b.titlePageBg = el.dataset.tpbg || null; })));
  root.querySelectorAll("[data-font]").forEach((el) => el.addEventListener("click", () => update((b) => { b.coverFont = el.dataset.font; })));
  root.querySelectorAll("[data-pattern]").forEach((el) => el.addEventListener("click", () => update((b) => { b.coverType = "pattern"; b.coverPattern = el.dataset.pattern; })));
  root.querySelectorAll("[data-ribbon]").forEach((el) => el.addEventListener("click", () => update((b) => { b.bookmarkColor = el.dataset.ribbon; })));
  root.querySelector("#ce-upload").addEventListener("click", () => document.getElementById("cover-image-input").click());
}

function renderPartsEditor() {
  const root = document.getElementById("parts-editor-body");
  const palette = ["#f7d9e3", "#e3dbf5", "#d8ecd8", "#fdf1b8", "#ffe3c9", "#f2d688", "#d8cfe8", "#c9e4e8"];
  root.innerHTML = S.book.parts.map((part, pi) => `
    <div class="part-edit-row">
      <input class="plain-input box" data-part-name="${pi}" value="${esc(part.name)}"/>
      <div class="swatch-row">
        ${palette.map((c) => `<button class="swatch-lg ${part.color === c ? "sel" : ""}" data-part-color="${pi}:${c}" style="background:${c}"></button>`).join("")}
      </div>
    </div>`).join("");
  root.querySelectorAll("[data-part-name]").forEach((el) => el.addEventListener("input", () => updateSilent((b) => { b.parts[parseInt(el.dataset.partName, 10)].name = el.value; })));
  root.querySelectorAll("[data-part-color]").forEach((el) => el.addEventListener("click", () => {
    const [pi, color] = el.dataset.partColor.split(":");
    update((b) => { b.parts[parseInt(pi, 10)].color = color; });
  }));
}

function renderTextBackup() {
  const json = JSON.stringify(S.book, null, 2);
  document.getElementById("backup-text-area").value = json;
}

/* ================= export / import wiring ================= */

function doExport(kind) {
  const book = S.book;
  const base = EXP.safeFileBase(book);
  if (kind === "json") EXP.downloadBlob(`${base}-backup.json`, new Blob([JSON.stringify(book, null, 2)], { type: "application/json" }));
  if (kind === "txt") EXP.downloadBlob(`${base}.txt`, new Blob([EXP.bookToText(book)], { type: "text/plain" }));
  if (kind === "md") EXP.downloadBlob(`${base}.md`, new Blob([EXP.bookToMarkdown(book)], { type: "text/markdown" }));
  if (kind === "html") EXP.downloadBlob(`${base}.html`, new Blob([EXP.bookToHTML(book)], { type: "text/html" }));
  if (kind === "epub") EXP.downloadBlob(`${base}.epub`, new Blob([EXP.bookToEpub(book)], { type: "application/epub+zip" }));
  if (kind === "pdf") {
    const w = window.open("", "_blank");
    w.document.write(EXP.bookToPrintableHTML(book));
    w.document.close();
    setTimeout(() => w.print(), 400);
  }
  if (kind === "copy-json") {
    navigator.clipboard.writeText(JSON.stringify(book, null, 2)).catch(() => {});
  }
  if (kind === "copy-md") {
    navigator.clipboard.writeText(EXP.bookToMarkdown(book)).catch(() => {});
  }
}

/* ================= event wiring (static, once) ================= */

function wireStaticEvents() {
  document.getElementById("menu-btn").addEventListener("click", () => { S.sidebarOpen = true; render(); });
  document.getElementById("sidebar-close").addEventListener("click", () => { S.sidebarOpen = false; render(); });
  document.getElementById("sidebar-backdrop").addEventListener("click", () => { S.sidebarOpen = false; render(); });
  document.getElementById("mode-btn").addEventListener("click", () => { S.mode = S.mode === "edit" ? "read" : "edit"; S.activePath = null; render(); });
  document.getElementById("prev-btn").addEventListener("click", () => goTo(S.pageIndex - 1));
  document.getElementById("next-btn").addEventListener("click", () => goTo(S.pageIndex + 1));
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") goTo(S.pageIndex + 1);
    if (e.key === "ArrowLeft") goTo(S.pageIndex - 1);
  });

  document.getElementById("parts-editor-btn").addEventListener("click", () => { S.partsEditorOpen = true; render(); });
  document.getElementById("cover-editor-close").addEventListener("click", () => { S.coverEditorOpen = false; render(); });
  document.getElementById("parts-editor-close").addEventListener("click", () => { S.partsEditorOpen = false; render(); });
  document.getElementById("text-backup-close").addEventListener("click", () => { S.textBackupOpen = false; render(); });
  document.getElementById("export-modal-close").addEventListener("click", () => { S.exportMenuOpen = false; render(); });

  document.getElementById("cover-image-input").addEventListener("change", (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update((b) => { b.coverImage = reader.result; b.coverType = "image"; });
    reader.readAsDataURL(file);
  });
  document.getElementById("cover-photo-input").addEventListener("change", (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update((b) => { b.coverPhoto = { src: reader.result, x: 50, y: 78, scale: 1, rotate: 0 }; });
    reader.readAsDataURL(file);
  });

  // decorate FAB
  document.getElementById("decorate-fab-btn").addEventListener("click", () => { S.decorateMenuOpen = !S.decorateMenuOpen; renderDecorateMenu(); });

  // backup / restore / export sidebar buttons
  document.getElementById("download-backup-btn").addEventListener("click", () => doExport("json"));
  document.getElementById("text-backup-btn").addEventListener("click", () => { S.textBackupOpen = true; render(); });
  document.getElementById("restore-file-input").addEventListener("change", (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        S.book = EXP.mergeWithDefaults(parsed, defaultBook);
        S.pageIndex = 0;
        scheduleSave();
        render();
      } catch (err) { alert("That file couldn't be read as a backup."); }
    };
    reader.readAsText(file);
  });
  document.getElementById("restore-file-btn").addEventListener("click", () => document.getElementById("restore-file-input").click());
  document.getElementById("export-menu-btn").addEventListener("click", () => { S.exportMenuOpen = true; render(); });
  document.querySelectorAll("[data-export]").forEach((b) => b.addEventListener("click", () => doExport(b.dataset.export)));

  document.getElementById("copy-backup-text-btn").addEventListener("click", async () => {
    const text = document.getElementById("backup-text-area").value;
    try {
      await navigator.clipboard.writeText(text);
      document.getElementById("copy-status").textContent = "Copied! Paste it into Notes, an email, or a message to yourself.";
    } catch (e) {
      document.getElementById("copy-status").textContent = "Couldn't auto-copy — tap the text box, select all, and copy manually.";
    }
  });
  document.getElementById("restore-paste-btn").addEventListener("click", () => {
    const val = document.getElementById("restore-paste-box").value;
    if (!val.trim()) return;
    try {
      const parsed = JSON.parse(val);
      S.book = EXP.mergeWithDefaults(parsed, defaultBook);
      S.pageIndex = 0;
      scheduleSave();
      S.textBackupOpen = false;
      render();
    } catch (e) { alert("That doesn't look like valid backup text."); }
  });
}

function renderDecorateMenu() {
  const menu = document.getElementById("decorate-menu");
  menu.classList.toggle("hidden", !S.decorateMenuOpen);
  if (!S.decorateMenuOpen) return;
  menu.innerHTML = DECORATION_TYPES.map((t) => {
    const map = { seal: "🔴", flower: "🌸", ribbon: "🎀", heart: "💕", star: "✨" };
    return `<button class="dec-opt" data-dec="${t}">${map[t]}</button>`;
  }).join("");
  menu.querySelectorAll("[data-dec]").forEach((b) => b.addEventListener("click", () => {
    const pageKey = pages[S.pageIndex].key;
    update((book) => {
      if (!book.decorations[pageKey]) book.decorations[pageKey] = [];
      book.decorations[pageKey].push({ id: uid(), type: b.dataset.dec, pos: { x: 50, y: 50, scale: 1, rotate: 0 } });
    });
    S.decorateMenuOpen = false;
  }));
}

/* ================= install prompt ================= */

let deferredInstallPrompt = null;

function wireInstallPrompt() {
  const section = document.getElementById("install-section");
  const btn = document.getElementById("install-btn");
  const iosHint = document.getElementById("ios-install-hint");

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  if (isStandalone) return; // already installed, nothing to show

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    section.classList.remove("hidden");
    btn.classList.remove("hidden");
  });

  btn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    btn.classList.add("hidden");
  });

  window.addEventListener("appinstalled", () => {
    section.classList.add("hidden");
  });

  if (isIOS) {
    section.classList.remove("hidden");
    iosHint.classList.remove("hidden");
  }
}

/* ================= boot ================= */

async function boot() {
  await loadInitial();
  wireStaticEvents();
  wireInstallPrompt();
  render();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("SW registration failed", e));
  }
}

boot();
