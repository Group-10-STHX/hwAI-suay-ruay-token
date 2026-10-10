"use strict";

// Wai gate: the one place that decides whether work may run.
//
// Real mode: every prompt, sub-agent, or queued agent needs one credit. A credit comes from a
// passed wai (score >= passMinScore). With no credit, the work waits in a queue.
// Demo mode: everything runs at once. Nothing is checked. It only shows what the agents do.
//
// Pure logic: no sockets, no timers except the wait timeout in waitFor(). Tested in test/.

const DEFAULT_PASS_MIN_SCORE = 70;
const MAX_TEXT = 200;
const MAX_REQUESTS_KEPT = 500;

const clip = (value, fallback = "") =>
  String(value ?? fallback).slice(0, MAX_TEXT);

class Gate {
  constructor({
    mode = "real",
    passMinScore = DEFAULT_PASS_MIN_SCORE,
    now = () => Date.now() / 1000,
  } = {}) {
    this.mode = mode;
    this.credits = 0;
    this.passMinScore = passMinScore;
    this.now = now;
    this.agents = new Map(); // agent id -> record shown by the popup
    this.agentOrder = [];
    this.requests = new Map(); // request id -> hook request record
    this.queue = []; // [{ type: 'agent' | 'req', id }] waiting for a credit
    this.waiters = new Map(); // request id -> [resolve]
    this.seq = 0;
  }

  // ----- mode and credits -----

  setMode(mode) {
    if (mode !== "real" && mode !== "demo")
      throw new Error("mode must be real or demo");
    this.mode = mode;
    if (mode === "demo") {
      for (const item of this.queue.splice(0)) this.release(item);
    } else {
      this.grant();
    }
  }

  setPassMinScore(score) {
    if (typeof score !== "number" || score < 0 || score > 100)
      throw new Error("passMinScore must be 0-100");
    this.passMinScore = score;
  }

  /** Called with the result of a wai check. Returns true when a credit was granted. */
  wai({ passed, score }) {
    const ok = Boolean(passed) && Number(score) >= this.passMinScore;
    if (ok) {
      this.credits += 1;
      this.grant();
    }
    return ok;
  }

  admit(item) {
    if (this.mode === "demo") return this.release(item);
    if (this.credits > 0) {
      this.credits -= 1;
      return this.release(item);
    }
    this.queue.push(item);
    return false;
  }

  grant() {
    while (this.credits > 0 && this.queue.length > 0) {
      this.credits -= 1;
      this.release(this.queue.shift());
    }
  }

  release(item) {
    if (item.type === "agent") {
      const agent = this.agents.get(item.id);
      if (agent && agent.state === "queued") {
        agent.state = "running";
        agent.started = this.now();
      }
      return true;
    }
    const req = this.requests.get(item.id);
    if (req && req.status === "pending") {
      req.status = "allowed";
      req.allowedAt = this.now();
      this.notify(item.id);
    }
    return true;
  }

  notify(id) {
    const list = this.waiters.get(id) ?? [];
    this.waiters.delete(id);
    for (const resolve of list) resolve("allow");
  }

  // ----- agents (popup and the lab simulator) -----

  startAgent({ id, parent_id, kind, model, label }) {
    const aid = clip(id);
    if (!aid) return false;
    if (!this.agents.has(aid)) this.agentOrder.push(aid);
    this.agents.set(aid, {
      id: aid,
      parent_id: clip(parent_id) || null,
      kind: kind === "main" ? "main" : "sub",
      model: clip(model, "unknown"),
      label: clip(label),
      state: "queued",
      started: this.now(),
      ended: null,
    });
    this.admit({ type: "agent", id: aid });
    return true;
  }

  /** Clears the agent list (popup and lab). Mode, credits, and hook requests are kept. */
  reset() {
    this.agents.clear();
    this.agentOrder = [];
    this.queue = this.queue.filter((item) => item.type !== "agent");
  }

  stopAgent(id) {
    const agent = this.agents.get(clip(id));
    if (!agent) return false;
    this.queue = this.queue.filter(
      (item) => !(item.type === "agent" && item.id === agent.id),
    );
    agent.state = "done";
    agent.ended = this.now();
    return true;
  }

  // ----- hook requests (Claude Code prompt and subagent gates) -----

  request({ kind, session_id, label }) {
    this.seq += 1;
    const id = `r${this.seq}`;
    const req = {
      id,
      kind: kind === "subagent" ? "subagent" : "prompt",
      session_id: clip(session_id),
      label: clip(label),
      status: "pending",
      created: this.now(),
      allowedAt: null,
    };
    this.requests.set(id, req);
    this.prune();
    this.admit({ type: "req", id });
    return req;
  }

  /**
   * Resolves with 'allow' as soon as the request is allowed, or 'pending' after timeoutMs.
   * Unknown ids resolve with 'deny' so a hook never waits on a request that does not exist.
   */
  waitFor(id, timeoutMs = 60000) {
    const req = this.requests.get(id);
    if (!req) return Promise.resolve("deny");
    if (req.status === "allowed") return Promise.resolve("allow");
    return new Promise((resolve) => {
      const list = this.waiters.get(id) ?? [];
      const timer = setTimeout(() => {
        const rest = (this.waiters.get(id) ?? []).filter((fn) => fn !== done);
        if (rest.length) this.waiters.set(id, rest);
        else this.waiters.delete(id);
        resolve("pending");
      }, timeoutMs);
      const done = (action) => {
        clearTimeout(timer);
        resolve(action);
      };
      list.push(done);
      this.waiters.set(id, list);
    });
  }

  prune() {
    if (this.requests.size <= MAX_REQUESTS_KEPT) return;
    for (const [id, req] of this.requests) {
      if (req.status === "allowed" && !this.waiters.has(id))
        this.requests.delete(id);
      if (this.requests.size <= MAX_REQUESTS_KEPT) break;
    }
  }

  // ----- read model -----

  snapshot() {
    return {
      mode: this.mode,
      credits: this.credits,
      passMinScore: this.passMinScore,
      queued: this.queue.map((item) => item.id),
      pendingRequests: [...this.requests.values()].filter(
        (r) => r.status === "pending",
      ).length,
      agents: this.agentOrder.map((id) => this.agents.get(id)).filter(Boolean),
    };
  }
}

module.exports = { Gate, DEFAULT_PASS_MIN_SCORE };
