"use strict";

// Local HTTP daemon on 127.0.0.1 only. The Electron app starts it, the MediaPipe Lab page
// is served from it (same origin, so no CORS), and Claude Code hooks call it.
//
//   GET  /mini/*                 mini window (static files from ./mini)
//   GET  /lab/*                  full control panel (static files from ./lab)
//   GET  /prefs, POST /prefs     look-and-feel prefs (theme, accent, mascot size, ...)
//   GET  /logos.json             logo manifest for the popup and lab
//   GET  /agents                 agents for the popup
//   GET  /state                  mode, credits, queue, pass threshold
//   POST /mode                   {mode: "real" | "demo"}
//   POST /settings               {passMinScore}
//   POST /wai                    {passed, score}: a wai check result; a pass grants one credit
//   POST /events                 {type: start | stop | reset, id, parent_id?, kind, model, label}
//   POST /wai/request            {kind: prompt | subagent, session_id, label} -> {id, status}
//   GET  /wai/wait/:id?timeout=  long-poll (max 60 s): {action: allow | pending | deny}

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const HOST = "127.0.0.1";
const DEFAULT_PORT = 7777;
const MAX_WAIT_MS = 60000;
const MAX_BODY = 64 * 1024;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function send(res, code, body, type = "application/json; charset=utf-8") {
  const data =
    Buffer.isBuffer(body) || typeof body === "string"
      ? body
      : JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": type,
    "Content-Length": Buffer.byteLength(data),
    "Cache-Control": "no-store",
  });
  res.end(data);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const body = chunks.length
          ? JSON.parse(Buffer.concat(chunks).toString("utf8"))
          : {};
        resolve(
          body && typeof body === "object" && !Array.isArray(body)
            ? body
            : null,
        );
      } catch {
        resolve(null);
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(res, rootDir, relPath) {
  const root = path.resolve(rootDir);
  const target = path.resolve(root, relPath === "" ? "index.html" : relPath);
  if (target !== root && !target.startsWith(root + path.sep))
    return send(res, 404, { error: "not found" });
  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, { error: "not found" });
    const type = TYPES[path.extname(target)] ?? "application/octet-stream";
    send(res, 200, fs.readFileSync(target), type);
  });
}

/**
 * @param {object} opts
 * @param {import('./gate').Gate} opts.gate
 * @param {string} opts.labDir        folder with the lab page
 * @param {string} opts.miniDir       folder with the mini window page
 * @param {string} opts.logosPath     path to logos.json
 * @param {{get: () => object, set: (patch: object) => object}} opts.prefs  look-and-feel prefs
 * @param {number} [opts.port]
 */
function createDaemon({ gate, labDir, miniDir, logosPath, prefs, port = DEFAULT_PORT }) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${HOST}`);
    const p = url.pathname;
    try {
      if (req.method === "GET") {
        if (p === "/") {
          res.writeHead(302, { Location: "/mini/" });
          return res.end();
        }
        if (p === "/mini" || p === "/mini/") return serveStatic(res, miniDir, "");
        if (p.startsWith("/mini/"))
          return serveStatic(res, miniDir, p.slice("/mini/".length));
        if (p === "/prefs") return send(res, 200, prefs.get());
        if (p === "/lab" || p === "/lab/") return serveStatic(res, labDir, "");
        if (p.startsWith("/lab/"))
          return serveStatic(res, labDir, p.slice("/lab/".length));
        if (p.startsWith("/assets/jason/"))
          return serveStatic(res, path.dirname(logosPath), p.slice("/assets/jason/".length));
        if (p === "/logos.json")
          return send(res, 200, fs.readFileSync(logosPath), TYPES[".json"]);
        if (p === "/agents")
          return send(res, 200, { agents: gate.snapshot().agents });
        if (p === "/state") return send(res, 200, gate.snapshot());
        const wait = p.match(/^\/wai\/wait\/([\w-]+)$/);
        if (wait) {
          const asked = Number(url.searchParams.get("timeout") ?? 55) * 1000;
          const timeout = Math.min(
            MAX_WAIT_MS,
            Math.max(0, Number.isFinite(asked) ? asked : 55000),
          );
          const action = await gate.waitFor(wait[1], timeout);
          return send(res, 200, { action });
        }
        return send(res, 404, { error: "not found" });
      }

      if (req.method === "POST") {
        const body = await readJson(req);
        if (body === null) return send(res, 400, { error: "bad json" });

        if (p === "/mode") {
          if (body.mode !== "real" && body.mode !== "demo")
            return send(res, 422, { error: "mode must be real or demo" });
          gate.setMode(body.mode);
          return send(res, 200, gate.snapshot());
        }
        if (p === "/prefs") return send(res, 200, prefs.set(body));
        if (p === "/settings") {
          try {
            gate.setPassMinScore(Number(body.passMinScore));
          } catch (err) {
            return send(res, 422, { error: err.message });
          }
          return send(res, 200, gate.snapshot());
        }
        if (p === "/wai") {
          const granted = gate.wai({ passed: body.passed, score: body.score });
          return send(res, 200, { passed: granted, ...gate.snapshot() });
        }
        if (p === "/events") {
          let ok = false;
          if (body.type === "reset") {
            gate.reset();
            ok = true;
          } else if (body.type === "start") {
            ok = gate.startAgent(body);
          } else if (body.type === "stop") {
            ok = gate.stopAgent(body.id);
          }
          return send(res, ok ? 200 : 422, { ok });
        }
        if (p === "/wai/request") {
          const req2 = gate.request(body);
          return send(res, 201, { id: req2.id, status: req2.status });
        }
        return send(res, 404, { error: "not found" });
      }

      return send(res, 405, { error: "method not allowed" });
    } catch (err) {
      return send(res, 500, { error: err.message });
    }
  });

  return {
    server,
    listen: () =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, HOST, () => resolve(server.address()));
      }),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

module.exports = { createDaemon, DEFAULT_PORT, HOST };
