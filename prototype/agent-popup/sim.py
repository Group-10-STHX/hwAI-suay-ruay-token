#!/usr/bin/env python3
"""Fake session for the popup test: one main agent, sub-agents spawn, run, and finish.

    python3 prototype/agent-popup/server.py     # terminal 1
    python3 prototype/agent-popup/sim.py        # terminal 2, then watch http://127.0.0.1:7777

Sends the same events a Claude Code hook would send to POST /events. Stdlib only.
"""

import json
import time
import urllib.request

URL = "http://127.0.0.1:7777/events"


def post(event):
    req = urllib.request.Request(
        URL,
        data=json.dumps(event).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        return resp.status


def main():
    post({"type": "reset"})
    post(
        {
            "type": "start",
            "id": "main",
            "kind": "main",
            "model": "claude-opus-5-5",
            "label": "ตอบผู้ใช้ · เพิ่มโหมดปรับ threshold ใน recorder",
        }
    )
    time.sleep(1.0)

    subs = [
        ("s1", "claude-haiku-5-5", "Explore · หาไฟล์ที่เกี่ยวกับ vision/"),
        ("s2", "claude-sonnet-5-5", "general-purpose · แก้ recorder.html"),
        ("s3", "claude-haiku-5-5", "Explore · อ่าน CAPTURE_PLAN.md"),
    ]
    for sid, model, label in subs:
        post(
            {
                "type": "start",
                "id": sid,
                "parent_id": "main",
                "kind": "sub",
                "model": model,
                "label": label,
            }
        )
        time.sleep(0.9)

    time.sleep(2.5)
    post({"type": "stop", "id": "s1"})
    time.sleep(1.5)
    post({"type": "stop", "id": "s3"})
    time.sleep(3.0)
    post({"type": "stop", "id": "s2"})
    time.sleep(1.0)
    post({"type": "stop", "id": "main"})
    print("done: main + 3 sub-agents sent")


if __name__ == "__main__":
    main()
