// db.js — IndexedDB persistence layer for the novel app.
// Replaces Claude Artifact window.storage entirely. No external dependencies.

const DB_NAME = "NovelAppDB";
const DB_VERSION = 1;
const STORE_BOOK = "book";       // single-record store: key "current" -> full book object
const STORE_BACKUPS = "backups"; // versioned auto-backups, keyed by timestamp

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_BOOK)) {
        db.createObjectStore(STORE_BOOK);
      }
      if (!db.objectStoreNames.contains(STORE_BACKUPS)) {
        db.createObjectStore(STORE_BACKUPS, { keyPath: "ts" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

export async function getBook() {
  const store = await tx(STORE_BOOK, "readonly");
  return new Promise((resolve, reject) => {
    const req = store.get("current");
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveBook(book) {
  const store = await tx(STORE_BOOK, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.put(book, "current");
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// Keep the last N automatic timestamped backups inside IndexedDB itself,
// as an extra safety net independent of the live "current" record.
const MAX_AUTO_BACKUPS = 10;

export async function pushAutoBackup(book) {
  const store = await tx(STORE_BACKUPS, "readwrite");
  const entry = { ts: Date.now(), book };
  await new Promise((resolve, reject) => {
    const req = store.put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  // prune old backups beyond MAX_AUTO_BACKUPS
  const all = await listAutoBackups();
  if (all.length > MAX_AUTO_BACKUPS) {
    const toDelete = all.slice(0, all.length - MAX_AUTO_BACKUPS);
    const delStore = await tx(STORE_BACKUPS, "readwrite");
    toDelete.forEach((b) => delStore.delete(b.ts));
  }
}

export async function listAutoBackups() {
  const store = await tx(STORE_BACKUPS, "readonly");
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result || []).sort((a, b) => a.ts - b.ts));
    req.onerror = () => reject(req.error);
  });
}

export async function getAutoBackup(ts) {
  const store = await tx(STORE_BACKUPS, "readonly");
  return new Promise((resolve, reject) => {
    const req = store.get(ts);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

// One-time migration: if an old localStorage key exists from a prior
// non-IndexedDB version, pull it in automatically so nothing is lost.
export async function migrateFromLegacyIfNeeded() {
  try {
    const existing = await getBook();
    if (existing) return existing; // already migrated / already has data
    const legacyRaw = localStorage.getItem("novel-book-legacy");
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw);
      await saveBook(parsed);
      return parsed;
    }
  } catch (e) {
    console.error("Migration check failed", e);
  }
  return null;
}
