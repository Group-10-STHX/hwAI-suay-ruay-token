"use strict";

// Look-and-feel preferences shared by the mini window and the popup.
// Stored by main.js in the app's userData folder; edited from the mini window's settings sheet.

const ACCENTS = Object.freeze({
  peach: "#ff8a65",
  mint: "#34b894",
  lilac: "#9b87f5",
  sky: "#4aa3ff",
  lemon: "#e8b520",
});

const DEFAULT_PREFS = Object.freeze({
  theme: "auto", // auto | light | dark
  accent: "peach", // a key of ACCENTS
  mascotSize: "m", // s | m | l, Jason's size in the popup
  bubbles: true, // speech bubbles in the popup
  alwaysOnTop: false, // the mini window floats above other windows
  showCamera: true, // camera preview in the mini window
  holdMs: 700, // how long a wai must be held
});

const ONE_OF = {
  theme: ["auto", "light", "dark"],
  accent: Object.keys(ACCENTS),
  mascotSize: ["s", "m", "l"],
};

/** Merges `patch` into `base`, keeping only known keys with valid values. */
function sanitizePrefs(patch, base = DEFAULT_PREFS) {
  const out = { ...DEFAULT_PREFS, ...base };
  if (!patch || typeof patch !== "object") return out;
  for (const [key, allowed] of Object.entries(ONE_OF)) {
    if (allowed.includes(patch[key])) out[key] = patch[key];
  }
  for (const key of ["bubbles", "alwaysOnTop", "showCamera"]) {
    if (typeof patch[key] === "boolean") out[key] = patch[key];
  }
  const hold = Number(patch.holdMs);
  if (Number.isFinite(hold) && hold >= 200 && hold <= 3000) out.holdMs = Math.round(hold);
  return out;
}

module.exports = { ACCENTS, DEFAULT_PREFS, sanitizePrefs };
