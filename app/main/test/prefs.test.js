"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_PREFS, sanitizePrefs } = require("../prefs");

test("unknown keys and bad values are dropped", () => {
  const out = sanitizePrefs({ theme: "neon", accent: "#000", evil: 1, bubbles: "yes", holdMs: 50 });
  assert.deepEqual(out, { ...DEFAULT_PREFS });
});

test("valid values are kept and merged onto the base", () => {
  const base = sanitizePrefs({ accent: "mint" });
  const out = sanitizePrefs({ theme: "dark", mascotSize: "l", bubbles: false, holdMs: 1200 }, base);
  assert.equal(out.accent, "mint");
  assert.equal(out.theme, "dark");
  assert.equal(out.mascotSize, "l");
  assert.equal(out.bubbles, false);
  assert.equal(out.holdMs, 1200);
});

test("a missing patch returns the base unchanged", () => {
  const base = sanitizePrefs({ alwaysOnTop: true });
  assert.deepEqual(sanitizePrefs(undefined, base), base);
});
