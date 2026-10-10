"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Gate } = require("../gate");

const fakeClock = () => {
  let t = 1000;
  return { now: () => t, tick: (s) => (t += s) };
};

test("real mode: a sub-agent waits until a passed wai grants a credit", () => {
  const g = new Gate({ mode: "real" });
  g.startAgent({
    id: "a1",
    kind: "sub",
    model: "claude-haiku-5-5",
    label: "Explore",
  });
  assert.equal(g.agents.get("a1").state, "queued");
  assert.deepEqual(g.snapshot().queued, ["a1"]);

  assert.equal(g.wai({ passed: true, score: 85 }), true);
  assert.equal(g.agents.get("a1").state, "running");
  assert.deepEqual(g.snapshot().queued, []);
  assert.equal(g.credits, 0);
});

test("real mode: a wai below the score threshold grants nothing", () => {
  const g = new Gate({ mode: "real", passMinScore: 70 });
  g.startAgent({ id: "a1", kind: "sub", model: "m", label: "" });
  assert.equal(g.wai({ passed: true, score: 69 }), false);
  assert.equal(g.agents.get("a1").state, "queued");
  assert.equal(g.wai({ passed: false, score: 95 }), false);
  assert.equal(g.agents.get("a1").state, "queued");
});

test("one passed wai unlocks exactly one queued item, oldest first", () => {
  const g = new Gate({ mode: "real" });
  g.startAgent({ id: "first", kind: "sub", model: "m", label: "" });
  g.startAgent({ id: "second", kind: "sub", model: "m", label: "" });
  g.wai({ passed: true, score: 90 });
  assert.equal(g.agents.get("first").state, "running");
  assert.equal(g.agents.get("second").state, "queued");
});

test("a credit saved up is used by the next agent without a new wai", () => {
  const g = new Gate({ mode: "real" });
  g.wai({ passed: true, score: 90 });
  assert.equal(g.credits, 1);
  g.startAgent({ id: "a1", kind: "sub", model: "m", label: "" });
  assert.equal(g.agents.get("a1").state, "running");
  assert.equal(g.credits, 0);
});

test("demo mode runs everything at once and never touches credits", () => {
  const g = new Gate({ mode: "demo" });
  g.startAgent({ id: "a1", kind: "main", model: "m", label: "" });
  g.startAgent({ id: "a2", kind: "sub", model: "m", label: "" });
  assert.equal(g.agents.get("a1").state, "running");
  assert.equal(g.agents.get("a2").state, "running");
  assert.equal(g.credits, 0);
});

test("switching back to demo releases everything that was queued", () => {
  const g = new Gate({ mode: "real" });
  g.startAgent({ id: "a1", kind: "sub", model: "m", label: "" });
  g.setMode("demo");
  assert.equal(g.agents.get("a1").state, "running");
  assert.deepEqual(g.snapshot().queued, []);
});

test("stopping a queued agent removes it from the queue", () => {
  const g = new Gate({ mode: "real" });
  g.startAgent({ id: "a1", kind: "sub", model: "m", label: "" });
  g.stopAgent("a1");
  assert.equal(g.agents.get("a1").state, "done");
  g.wai({ passed: true, score: 90 });
  assert.equal(g.credits, 1, "no queued item was left to consume the credit");
});

test("a hook request with no credit stays pending until a pass allows it", async () => {
  const g = new Gate({ mode: "real" });
  const req = g.request({ kind: "prompt", session_id: "s", label: "hi" });
  assert.equal(req.status, "pending");
  const waiting = g.waitFor(req.id, 5000);
  g.wai({ passed: true, score: 88 });
  assert.equal(await waiting, "allow");
  assert.equal(g.requests.get(req.id).status, "allowed");
});

test("waitFor returns pending on timeout and the request stays pending", async () => {
  const g = new Gate({ mode: "real" });
  const req = g.request({ kind: "subagent", session_id: "s", label: "" });
  assert.equal(await g.waitFor(req.id, 20), "pending");
  assert.equal(g.requests.get(req.id).status, "pending");
});

test("demo mode allows hook requests immediately", async () => {
  const g = new Gate({ mode: "demo" });
  const req = g.request({ kind: "prompt", session_id: "s", label: "" });
  assert.equal(req.status, "allowed");
  assert.equal(await g.waitFor(req.id, 20), "allow");
});

test("an unknown request id is denied rather than held forever", async () => {
  const g = new Gate({ mode: "real" });
  assert.equal(await g.waitFor("nope", 20), "deny");
});

test("a pass grants to a pending hook request before a queued agent is started later", () => {
  const clock = fakeClock();
  const g = new Gate({ mode: "real", now: clock.now });
  const req = g.request({ kind: "prompt", session_id: "s", label: "" });
  clock.tick(1);
  g.startAgent({ id: "a1", kind: "sub", model: "m", label: "" });
  g.wai({ passed: true, score: 90 });
  assert.equal(g.requests.get(req.id).status, "allowed");
  assert.equal(g.agents.get("a1").state, "queued");
});

test("setPassMinScore validates the range", () => {
  const g = new Gate();
  assert.throws(() => g.setPassMinScore(150));
  g.setPassMinScore(55);
  assert.equal(g.passMinScore, 55);
});
