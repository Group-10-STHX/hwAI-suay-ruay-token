hwAI ไหว้กูซะ — แผนสำหรับวางลง Drawdy
Oct 10, 2026 · @Someone
วิธีใช้
ทุกกล่องสีเทาด้านล่าง = 1 กล่องใน Drawdy กด copy ที่มุมกล่อง แล้ววางเป็น text/sticky บนบอร์ดได้เลย
• สีน้ำเงิน = Front (ตามบอร์ดเดิม) · สีเขียว = Back · สีส้ม = Integrations ตัวใหม่
• หัวข้อ [กล่อง] ในแต่ละ block = ชื่อกล่อง ส่วน → = ลูกศรที่ต้องลากเอง
• ถ้า Drawdy รับ Mermaid ได้ ใช้ block Mermaid ในหัวข้อ Architecture แทนการวาดมือได้
Architecture
ทุกช่องทางยิงเข้า daemon ตัวเดียวที่ localhost:7777 แล้วรอผลไหว้
[Integrations — สีส้ม]
Claude Code hook
• UserPromptSubmit = prompt หลัก
• PreToolUse (Task|Agent) = ทุก subagent
Shell wrapper (claude / codex / gemini)
Browser extension (claude.ai / chatgpt)
→ POST localhost:7777/wai
[Popup — สีน้ำเงิน]
Overlay แบบน้อง dot "ไหว้กูซะ"
• กองการ์ด = agent ที่ค้างไหว้
• แถบ level + score
• โกรธ = window หนีเมาส์
[Connect กล้อง + AI — สีเขียว]
Daemon (Electron main)
• HTTP server :7777 + long-poll
• Queue: 1 ไหว้ = ปลด 1 agent
• Anger counter ต่อ session
• WAI_BYPASS=1 ตอน dev
[Image Process — สีเขียว]
MediaPipe Hands + Pose (รันในเครื่อง)
• พนมมือ: wrist ชิด + ปลายนิ้วชี้ขึ้น
• ค้าง ≥ 1 วินาที
[Level การไหว้ — สีเขียว]
Lv0 ไม่ไหว้
Lv1 มือระดับอก (ไหว้เพื่อน)
Lv2 ปลายนิ้วถึงจมูก (ไหว้ผู้ใหญ่)
Lv3 นิ้วโป้งถึงหน้าผาก + ก้มหัว (ไหว้พระ)
Score = สมมาตร + องศาก้ม + เวลาค้าง
[Extras — สีน้ำเงิน]
เสียงแจ้งเตือน: edge-tts เสียงไทย
Sticker: frame ตอน score สูงสุด + ตัดพื้นหลัง
Leaderboard + ไหว้ดีเด่น: Supabase
ลูกศรที่ต้องลากบนบอร์ด:
Integrations → Connect → Popup
Popup → Connect → Image Process → Level → Connect → Integrations (allow / retry / deny)
Popup → Sticker / Leaderboard / เสียงแจ้งเตือน
เวอร์ชัน Mermaid (ถ้า Drawdy รับ):
flowchart LR
  CC[Claude Code hook] --> D
  SH[Shell wrapper] --> D
  EX[Browser extension] --> D
  D[Daemon :7777<br/>queue + anger] <--> P[Popup ไหว้กูซะ]
  P <--> V[MediaPipe<br/>Image Process]
  V --> L[Level การไหว้ 0-3]
  L --> D
  P --> T[TTS]
  P --> S[Sticker]
  P --> B[Leaderboard]
State machine
ไหว้ไม่ผ่านครบ 6 ครั้ง = rage quit ส่วนไหว้ Lv3 คือทางเดียวที่จะได้คืนดี
[State ปกติ]
IDLE → DEMANDING (เด้ง "ไหว้กูซะ")
→ WATCHING (เปิดกล้อง)
→ PASSED (ปลด agent 1 ตัว)
[ไหว้ไม่ผ่าน — นับต่อ session]
ครั้ง 1–2: RETRY "ไหว้ใหม่ ไม่สวย" + โชว์ score
ครั้ง 3–4: ANNOYED ด่าด้วยเสียง + window หนี + ต้อง Lv ≥ 2
ครั้ง 5: SULKING บล็อกทุก request
ครั้ง 6: RAGE_QUIT หยุด Claude + ย้าย session ไป ~/.wai/sulk/
[คืนดี]
FORGIVE: ไหว้ Lv3 → คืน session + reset anger
ลูกศรที่ต้องลาก:
WATCHING → PASSED (score ผ่าน)
WATCHING → RETRY → WATCHING
RETRY → ANNOYED → SULKING → RAGE_QUIT
RAGE_QUIT → FORGIVE → IDLE
stateDiagram-v2
  IDLE --> DEMANDING
  DEMANDING --> WATCHING
  WATCHING --> PASSED: ไหว้ผ่าน
  WATCHING --> RETRY: ไม่สวย (1-2)
  RETRY --> WATCHING
  RETRY --> ANNOYED: 3-4
  ANNOYED --> SULKING: 5
  SULKING --> RAGE_QUIT: 6
  RAGE_QUIT --> IDLE: ไหว้ Lv3 คืนดี
  PASSED --> IDLE
แบ่งงาน 6 คน
แต่ละคนทำงานในโฟลเดอร์ตัวเองเท่านั้น และใช้ mock แทนงานคนอื่นจนกว่าจะถึง milestone 2
[#1 Lead / Core — /app/main]
Electron main, server :7777, long-poll
Queue, anger ต่อ session, sulk/forgive
WAI_BYPASS, review + merge PR
Mock: fake vision event
[#2 Overlay UI — /app/renderer]
Popup แบบน้อง dot "ไหว้กูซะ"
กองการ์ดหลาย agent, แถบ level/score
Animation โกรธ, window หนีเมาส์
Mock: state ปลอม
[#3 Vision — /vision]  ★ critical path
MediaPipe Hands + Pose
Heuristic ไหว้ + level 0–3 + score
ค้าง ≥ 1s
Mock: webcam ใน HTML เปล่า
[#4 Integrations — /integrations]  ★ critical path
Hook UserPromptSubmit + PreToolUse(Task|Agent)
timeout 300, rage_quit = continue:false
Shell wrapper, browser extension
Mock: fake server ตอบ passed
[#5 Voice & Personality — /voice]
edge-tts เสียงไทย
บทพูดไล่ความโกรธ 6 ขั้น + คืนดี
Sound effect
Mock: CLI รับ state แล้วพูด
[#6 Extras & Ship — /extras /docs]
Sticker (ตัดพื้นหลัง + ข้อความ)
Leaderboard (Supabase)
electron-builder dmg/exe, README
สไลด์พิช + คลิปเดโมสำรอง
ชื่อคนในทีมยังไม่ได้ใส่ เติมต่อท้าย #1–#6 เองได้เลย
Contract, milestones, ตัด scope
กล่อง contract ให้ commit เป็น CLAUDE.md ด้วย ทุก agent จะได้อ่าน spec เดียวกัน
[Contract API — localhost:7777]
POST /wai/request {source, kind: prompt|subagent, session_id, agent_label?} → {id}
GET  /wai/wait/:id → {passed, level, score, action: allow|retry|deny|rage_quit}
GET  /wai/queue → [{id, kind, agent_label}]
POST /wai/forgive/:session_id
Vision event: {isWai, level 0-3, score 0-100, holdMs}
[Milestones — % ของเวลาแข่ง]
0%   ล็อก contract (30 นาที)
30%  ทุกคนรันกับ mock ได้
50%  End-to-end บน mac: hook → popup → ไหว้ → pass  ★
70%  Windows + โกรธ/งอน + TTS
85%  Feature freeze → แก้ bug + ซ้อมเดโม + คลิปสำรอง
[ตัด scope ถ้าเวลาไม่พอ]
ตัดก่อน: Leaderboard → Browser extension → Sticker
ห้ามตัด: Hook + Popup + ไหว้ผ่าน + โกรธ/หนี
[กฎทีม]
Branch ละคน, PR เล็กๆ, #1 merge
แก้ API = แก้ CLAUDE.md ก่อน + บอกกลุ่ม
ห้ามลง hook แบบ global ตอน dev (เดี๋ยว session งานตัวเองหาย)