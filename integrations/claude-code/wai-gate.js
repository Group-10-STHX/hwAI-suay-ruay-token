#!/usr/bin/env node
"use strict";

// Claude Code hook: holds a prompt or a sub-agent until the hwAI app allows it.
//
//   node wai-gate.js prompt      UserPromptSubmit hook
//   node wai-gate.js subagent    PreToolUse hook, matcher "Task|Agent"
//
// Exit 0 = allowed. Exit 2 = blocked (Claude Code shows stderr to the user).
// While the wai is not passed, this keeps long-polling the daemon. It gives up after
// WAI_TIMEOUT_S (default 300, matching the hook timeout in the spec).
// WAI_BYPASS=1 skips the gate for development. Do not install this hook globally during dev.

const DAEMON = process.env.WAI_DAEMON || "http://127.0.0.1:7777";
const TIMEOUT_S = Number(process.env.WAI_TIMEOUT_S || 300);
const POLL_S = 55;

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    if (process.stdin.isTTY) return resolve({});
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

function block(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

async function main() {
  if (process.env.WAI_BYPASS === "1") process.exit(0);

  const kind = process.argv[2] === "subagent" ? "subagent" : "prompt";
  const input = await readStdin();
  const label =
    kind === "subagent"
      ? String(
          input.tool_input?.description ??
            input.tool_input?.subagent_type ??
            "",
        )
      : String(input.prompt ?? "").slice(0, 80);

  let id;
  try {
    const res = await fetch(`${DAEMON}/wai/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, session_id: input.session_id ?? "", label }),
    });
    ({ id } = await res.json());
  } catch {
    block("ไหว้กูซะ: เปิดแอป hwAI ก่อน (daemon ไม่ตอบ)");
  }

  const deadline = Date.now() + TIMEOUT_S * 1000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${DAEMON}/wai/wait/${id}?timeout=${POLL_S}`);
      const { action } = await res.json();
      if (action === "allow") process.exit(0);
      if (action === "deny") block("ไหว้กูซะ: คำขอนี้ถูกปฏิเสธ");
    } catch {
      block("ไหว้กูซะ: ติดต่อ daemon ไม่ได้");
    }
  }
  block("ไหว้กูซะ: หมดเวลาแล้วยังไม่ได้ไหว้ ลองไหว้ใหม่");
}

main();
