// export.js — export/import system with a hand-written ZIP writer (for EPUB),
// no external libraries. Also handles JSON/Markdown/TXT/HTML export and
// JSON/text-paste import + validation.

/* ---------------- helpers ---------------- */

export function stripHtml(html) {
  if (!html) return "";
  // Insert real line breaks at block boundaries BEFORE stripping tags,
  // since element.textContent silently drops them (e.g. "<p>A</p><p>B</p>"
  // would otherwise become "AB" with no separator at all).
  let s = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n\n");
  const d = document.createElement("div");
  d.innerHTML = s;
  const text = d.textContent || d.innerText || "";
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function htmlToMarkdownInline(html) {
  if (!html) return "";
  let s = html;
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div)>/gi, "\n\n");
  s = s.replace(/<(strong|b)>(.*?)<\/(strong|b)>/gi, "**$2**");
  s = s.replace(/<(em|i)>(.*?)<\/(em|i)>/gi, "*$2*");
  s = s.replace(/<u>(.*?)<\/u>/gi, "$1");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function safeFileBase(book) {
  return (book.title || "my-novel").split("\n")[0].replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "my-novel";
}

/* ---------------- content builders ---------------- */

function orderedTextPieces(book) {
  const pieces = [];
  if (book.letterOne) pieces.push({ kind: "letter", title: "", text: stripHtml(book.letterOne) });
  if (book.letterTwo) pieces.push({ kind: "letter", title: "", text: stripHtml(book.letterTwo) });
  if (book.dedication) pieces.push({ kind: "dedication", title: "", text: stripHtml(book.dedication) });
  (book.chapters || []).forEach((ch, ci) => {
    const sceneTexts = (ch.blocks || [])
      .filter((b) => b.type === "text")
      .map((b) => stripHtml(b.content))
      .filter(Boolean);
    pieces.push({ kind: "chapter", title: `Chapter ${ci + 1}: ${ch.title || ""}`, text: sceneTexts.join("\n\n") });
  });
  if (book.backNote) pieces.push({ kind: "backnote", title: "", text: stripHtml(book.backNote) });
  return pieces;
}

export function bookToText(book) {
  const pieces = orderedTextPieces(book);
  let out = `${book.title || "Untitled"}\n`;
  if (book.subtitle) out += `${book.subtitle}\n`;
  out += `by ${book.author || ""}\n\n${"=".repeat(40)}\n\n`;
  pieces.forEach((p) => {
    if (p.kind === "chapter") {
      out += `${p.title}\n${"-".repeat(p.title.length)}\n\n${p.text}\n\n\n`;
    } else if (p.text) {
      out += `${p.text}\n\n\n`;
    }
  });
  return out;
}

export function bookToMarkdown(book) {
  let out = `# ${book.title || "Untitled"}\n\n`;
  if (book.subtitle) out += `*${book.subtitle}*\n\n`;
  out += `**By ${book.author || ""}**\n\n---\n\n`;
  if (book.dedication) out += `> ${htmlToMarkdownInline(book.dedication)}\n\n---\n\n`;
  if (book.letterOne) out += `${htmlToMarkdownInline(book.letterOne)}\n\n---\n\n`;
  if (book.letterTwo) out += `${htmlToMarkdownInline(book.letterTwo)}\n\n---\n\n`;
  (book.chapters || []).forEach((ch, ci) => {
    out += `## Chapter ${ci + 1}: ${ch.title || ""}\n\n`;
    (ch.blocks || []).forEach((b) => {
      if (b.type === "text") out += `${htmlToMarkdownInline(b.content)}\n\n`;
      if (b.type === "image" && b.caption) out += `*[image: ${b.caption}]*\n\n`;
    });
  });
  if (book.backNote) out += `---\n\n*${htmlToMarkdownInline(book.backNote)}*\n`;
  return out;
}

export function bookToHTML(book) {
  const esc = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let body = `<h1>${esc(book.title)}</h1>`;
  if (book.subtitle) body += `<p class="subtitle">${esc(book.subtitle)}</p>`;
  body += `<p class="author">by ${esc(book.author)}</p><hr/>`;
  if (book.dedication) body += `<div class="dedication">${book.dedication}</div><hr/>`;
  if (book.letterOne) body += `<div class="letter">${book.letterOne}</div><hr/>`;
  if (book.letterTwo) body += `<div class="letter">${book.letterTwo}</div><hr/>`;
  (book.chapters || []).forEach((ch, ci) => {
    body += `<h2>Chapter ${ci + 1}: ${esc(ch.title)}</h2>`;
    (ch.blocks || []).forEach((b) => {
      if (b.type === "text") body += `<div class="scene">${b.content || ""}</div>`;
      if (b.type === "image" && b.src) body += `<figure><img src="${b.src}" style="max-width:100%"/><figcaption>${esc(b.caption || "")}</figcaption></figure>`;
    });
  });
  if (book.backNote) body += `<hr/><div class="backnote">${book.backNote}</div>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(book.title)}</title>
<style>
body{font-family:Georgia,'Palatino Linotype',serif;max-width:700px;margin:40px auto;padding:0 20px;line-height:1.8;color:#40323a;background:#fbf7f0;}
h1{font-size:2em;text-align:center;color:#5a3d47;}
h2{margin-top:2.5em;color:#5a3d47;border-bottom:1px solid #e0d0d5;padding-bottom:.3em;}
.subtitle{text-align:center;font-style:italic;color:#8a7178;}
.author{text-align:center;letter-spacing:2px;font-size:.8em;color:#8a7178;text-transform:uppercase;}
.dedication,.letter,.backnote{font-style:italic;text-align:center;color:#5a4650;}
hr{border:none;border-top:1px dotted #d8c9c2;margin:2.5em 0;}
figure{text-align:center;margin:2em 0;}
figcaption{font-style:italic;font-size:.85em;color:#8a7178;}
</style></head><body>${body}</body></html>`;
}

export function bookToPrintableHTML(book) {
  const html = bookToHTML(book);
  return html.replace("</style>", `
@page { margin: 2cm; }
@media print { body{background:#fff;} }
</style>`);
}

/* ---------------- ZIP writer (hand-written, no libraries) ---------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function strToBytes(str) {
  return new TextEncoder().encode(str);
}

function dosDateTime() {
  const d = new Date();
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

export function createZip(files) {
  const { time, date } = dosDateTime();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach((f) => {
    const nameBytes = strToBytes(f.name);
    const data = f.data instanceof Uint8Array ? f.data : strToBytes(f.data);
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);

    localParts.push(new Uint8Array(local.buffer), nameBytes, data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, time, true);
    central.setUint16(14, date, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint16(30, 0, true);
    central.setUint16(32, 0, true);
    central.setUint16(34, 0, true);
    central.setUint16(36, 0, true);
    central.setUint32(38, 0, true);
    central.setUint32(42, offset, true);

    centralParts.push(new Uint8Array(central.buffer), nameBytes);

    offset += 30 + nameBytes.length + data.length;
  });

  const centralStart = offset;
  let centralSize = 0;
  centralParts.forEach((p) => (centralSize += p.length));

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(4, 0, true);
  end.setUint16(6, 0, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, centralStart, true);
  end.setUint16(20, 0, true);

  const allParts = [...localParts, ...centralParts, new Uint8Array(end.buffer)];
  const totalLen = allParts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(totalLen);
  let pos = 0;
  allParts.forEach((p) => { out.set(p, pos); pos += p.length; });
  return out;
}

/* ---------------- EPUB builder ---------------- */

export function bookToEpub(book) {
  const esc = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const uid = "urn:uuid:" + (book.id || "novel-" + Date.now());
  const chapters = book.chapters || [];

  const manifestItems = [];
  const spineItems = [];
  const navPoints = [];
  const files = [];

  files.push({ name: "mimetype", data: strToBytes("application/epub+zip") });
  files.push({
    name: "META-INF/container.xml",
    data: strToBytes(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`),
  });

  files.push({
    name: "OEBPS/styles.css",
    data: strToBytes(`body{font-family:Georgia,serif;line-height:1.7;margin:1.5em;} h1,h2{font-family:Georgia,serif;} .center{text-align:center;font-style:italic;}`),
  });
  manifestItems.push(`<item id="css" href="styles.css" media-type="text/css"/>`);

  function addXhtml(id, title, innerHtml) {
    const fname = `${id}.xhtml`;
    files.push({
      name: `OEBPS/${fname}`,
      data: strToBytes(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
<body>${innerHtml}</body></html>`),
    });
    manifestItems.push(`<item id="${id}" href="${fname}" media-type="application/xhtml+xml"/>`);
    spineItems.push(`<itemref idref="${id}"/>`);
    navPoints.push({ id, title, fname });
  }

  addXhtml("titlepage", book.title, `<h1 class="center">${esc(book.title)}</h1>${book.subtitle ? `<p class="center">${esc(book.subtitle)}</p>` : ""}<p class="center">by ${esc(book.author)}</p>`);
  if (book.letterOne) addXhtml("letter1", "Letter", book.letterOne);
  if (book.letterTwo) addXhtml("letter2", "Letter", book.letterTwo);
  if (book.dedication) addXhtml("dedication", "Dedication", `<div class="center">${book.dedication}</div>`);

  chapters.forEach((ch, ci) => {
    let inner = `<h2>Chapter ${ci + 1}: ${esc(ch.title)}</h2>`;
    (ch.blocks || []).forEach((b) => {
      if (b.type === "text") inner += `<div>${b.content || ""}</div>`;
      if (b.type === "image" && b.caption) inner += `<p class="center"><em>[image: ${esc(b.caption)}]</em></p>`;
    });
    addXhtml(`chapter${ci + 1}`, `Chapter ${ci + 1}`, inner);
  });

  if (book.backNote) addXhtml("backnote", "Note", `<div class="center">${book.backNote}</div>`);

  const navMap = navPoints.map((n, i) => `
<navPoint id="np${i}" playOrder="${i + 1}"><navLabel><text>${esc(n.title)}</text></navLabel><content src="${n.fname}"/></navPoint>`).join("");

  files.push({
    name: "OEBPS/toc.ncx",
    data: strToBytes(`<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head>
<meta name="dtb:uid" content="${uid}"/></head>
<docTitle><text>${esc(book.title)}</text></docTitle>
<navMap>${navMap}</navMap></ncx>`),
  });
  manifestItems.push(`<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`);

  files.push({
    name: "OEBPS/content.opf",
    data: strToBytes(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>${esc(book.title)}</dc:title>
<dc:creator>${esc(book.author)}</dc:creator>
<dc:identifier id="BookId">${uid}</dc:identifier>
<dc:language>en</dc:language>
</metadata>
<manifest>${manifestItems.join("")}</manifest>
<spine toc="ncx">${spineItems.join("")}</spine>
</package>`),
  });

  return createZip(files);
}

/* ---------------- import / restore ---------------- */

export function mergeWithDefaults(parsed, defaultBookFn) {
  const merged = { ...defaultBookFn(), ...parsed };
  if (!Array.isArray(merged.parts) || merged.parts.length === 0) merged.parts = defaultBookFn().parts;
  if (!merged.decorations || typeof merged.decorations !== "object") merged.decorations = {};
  if (!Array.isArray(merged.soundtrack)) merged.soundtrack = [];
  if (!Array.isArray(merged.chapters)) merged.chapters = defaultBookFn().chapters;
  return merged;
}
