-- เพิ่ม source 'codex' (เดิม Codex ถูกรวมเป็น 'shell' ทำให้ leaderboard ไม่เห็นชื่อ)
alter table public.wais drop constraint if exists wais_source_check;
alter table public.wais add constraint wais_source_check
  check (source in ('claude_code', 'codex', 'shell', 'extension'));
