#!/usr/bin/env python3
"""Local test server for hwAI: agent popup board, MediaPipe Lab, and the gate state.

    python3 prototype/agent-popup/server.py      # then open http://127.0.0.1:7777

Pages
    GET  /                    agent popup board (index.html)
    GET  /lab/                MediaPipe Lab control panel (prototype/lab/)
    GET  /logos.json          logo manifest shared with characters/jason/

Agents
    GET  /agents              list of agents with state: running | queued | done
    POST /events              {"type": "start"|"stop"|"reset", "id", "parent_id"?, "kind": "main"|"sub",
                               "model", "label"}  (Claude Code hooks would post here)

Gate (wai)
    GET  /state               {"mode", "credits", "queued", "passMinScore"}
    POST /mode                {"mode": "real" | "demo"}
    POST /wai                 {"passed": bool, "level", "score"}  one pass grants one queued agent

Real mode: a new agent only runs when a credit is available. Demo mode: everything runs at once.
Stdlib only. Binds 127.0.0.1 only.
"""

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
LAB_DIR = ROOT / "prototype" / "lab"
LOGOS = ROOT / "characters" / "jason" / "logos.json"
HOST, PORT = "127.0.0.1", 7777
MAX_TEXT = 200
PASS_MIN_SCORE = 70

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
}

lock = threading.Lock()
agents = {}  # id -> record
order = []  # ids in arrival order
queue = []  # ids waiting for a credit (real mode)
gate = {"mode": "demo", "credits": 0, "passMinScore": PASS_MIN_SCORE}


def clip(value, default=""):
    return str(value if value is not None else default)[:MAX_TEXT]


def start_running(aid):
    agents[aid]["state"] = "running"
    agents[aid]["started"] = time.time()


def grant_credits():
    """Hand each available credit to the oldest queued agent."""
    while gate["credits"] > 0 and queue:
        aid = queue.pop(0)
        if aid in agents and agents[aid]["state"] == "queued":
            gate["credits"] -= 1
            start_running(aid)


def apply_event(ev):
    kind = ev.get("type")
    if kind == "reset":
        agents.clear()
        order.clear()
        queue.clear()
        return True
    aid = clip(ev.get("id"))
    if not aid:
        return False
    if kind == "start":
        if aid not in agents:
            order.append(aid)
        agents[aid] = {
            "id": aid,
            "parent_id": clip(ev.get("parent_id")) or None,
            "kind": "main" if ev.get("kind") == "main" else "sub",
            "model": clip(ev.get("model"), "unknown"),
            "label": clip(ev.get("label")),
            "state": "queued",
            "started": time.time(),
            "ended": None,
        }
        if gate["mode"] == "demo":
            start_running(aid)
        elif gate["credits"] > 0:
            gate["credits"] -= 1
            start_running(aid)
        else:
            queue.append(aid)
        return True
    if kind == "stop" and aid in agents:
        if aid in queue:
            queue.remove(aid)
        agents[aid]["state"] = "done"
        agents[aid]["ended"] = time.time()
        return True
    return False


def ordered_agents():
    return [agents[i] for i in order if i in agents]


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        data = (
            body
            if isinstance(body, bytes)
            else json.dumps(body, ensure_ascii=False).encode("utf-8")
        )
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return None
        return body if isinstance(body, dict) else None

    def _serve_lab(self, rel):
        if rel in ("", "/"):
            rel = "index.html"
        target = (LAB_DIR / rel).resolve()
        if LAB_DIR.resolve() not in target.parents or not target.is_file():
            return self._send(404, {"error": "not found"})
        ctype = CONTENT_TYPES.get(target.suffix, "application/octet-stream")
        return self._send(200, target.read_bytes(), ctype)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/":
            return self._send(
                200, (HERE / "index.html").read_bytes(), "text/html; charset=utf-8"
            )
        if path == "/lab" or path.startswith("/lab/"):
            return self._serve_lab(
                path[len("/lab/") :] if path.startswith("/lab/") else ""
            )
        if path == "/agents":
            with lock:
                return self._send(200, {"agents": ordered_agents()})
        if path == "/state":
            with lock:
                return self._send(200, {**gate, "queued": list(queue)})
        if path == "/logos.json":
            return self._send(200, LOGOS.read_bytes())
        self._send(404, {"error": "not found"})

    def do_POST(self):
        ev = self._read_json()
        if ev is None:
            return self._send(400, {"error": "bad json"})
        if self.path == "/events":
            with lock:
                ok = apply_event(ev)
            return self._send(200 if ok else 422, {"ok": ok})
        if self.path == "/mode":
            mode = ev.get("mode")
            if mode not in ("real", "demo"):
                return self._send(422, {"error": "mode must be real or demo"})
            with lock:
                gate["mode"] = mode
                if mode == "demo":
                    for aid in list(queue):
                        start_running(aid)
                    queue.clear()
                return self._send(200, {**gate, "queued": list(queue)})
        if self.path == "/settings":
            score = ev.get("passMinScore")
            if not isinstance(score, (int, float)) or not 0 <= score <= 100:
                return self._send(422, {"error": "passMinScore must be 0-100"})
            with lock:
                gate["passMinScore"] = float(score)
                return self._send(200, {**gate, "queued": list(queue)})
        if self.path == "/wai":
            with lock:
                score = ev.get("score") or 0
                passed = bool(ev.get("passed")) and float(score) >= gate["passMinScore"]
                if passed:
                    gate["credits"] += 1
                    grant_credits()
                return self._send(
                    200, {"passed": passed, **gate, "queued": list(queue)}
                )
        self._send(404, {"error": "not found"})

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"hwAI test server on http://{HOST}:{PORT}  (lab: /lab/)")
    server.serve_forever()
