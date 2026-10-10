// Public API types. docs/API.md documents exactly these shapes — change both together.

export type Level = 0 | 1 | 2 | 3;
export type Metric = 'survival' | 'beauty' | 'count' | 'lv3' | 'streak' | 'shame';
export type Period = 'day' | 'week' | 'month' | 'all';
export type Action = 'allow' | 'retry' | 'deny' | 'rage_quit';
export type Source = 'claude_code' | 'shell' | 'extension';
export type Kind = 'prompt' | 'subagent';
export type Unit = 'percent' | 'score' | 'wais' | 'days' | 'rage_quits' | 'ms';

/** Data mode reported by /health: memory + seeded mock data, memory with WAI_BLOCK_MOCK=1, or Supabase. */
export type StoreMode = 'simulation' | 'real-only' | 'supabase';

export interface Health {
  ok: true;
  store: 'mock' | 'supabase';
  mode: StoreMode;
  players: number;
  wais: number;
  time: string;
}

export const METRICS: Metric[] = ['survival', 'beauty', 'count', 'lv3', 'streak', 'shame'];
export const PERIODS: Period[] = ['day', 'week', 'month', 'all'];

export interface PlayerRef {
  id: string;
  handle: string;
  display_name: string;
  avatar_hue: number;
}

export interface WaiRef {
  id: string;
  level: Level;
  score: number;
  hold_ms: number;
  created_at: string;
  sticker_url: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  player: PlayerRef;
  value: number;
  unit: Unit;
  delta_rank: number | null;
  best: WaiRef | null;
  stats: { attempts: number; count: number; beautiful: number; avg_score: number; lv3: number };
}

export interface Leaderboard {
  metric: Metric;
  period: Period;
  range: { from: string | null; to: string };
  generated_at: string;
  total: number;
  entries: LeaderboardEntry[];
}

export interface HofRecord {
  key: string;
  title: string;
  value: number;
  unit: Unit;
  player: PlayerRef;
  achieved_at: string | null;
  wai: WaiRef | null;
}

export interface Champion {
  week: string;
  from: string;
  to: string;
  provisional: boolean;
  player: PlayerRef;
  score: number;
  level: Level;
}

export interface HallOfFame {
  generated_at: string;
  records: HofRecord[];
  champions: Champion[];
}

export interface StatsBlock {
  wais: number;
  passed: number;
  beautiful: number;
  avg_score: number;
  lv3: number;
  rage_quits: number;
  active_players: number;
}

export interface Stats extends StatsBlock {
  period: Exclude<Period, 'all'>;
  prev: StatsBlock;
}

export interface FeedItem {
  id: string;
  player: PlayerRef;
  level: Level;
  score: number;
  hold_ms: number;
  passed: boolean;
  beautiful: boolean;
  action: Action;
  forgave: boolean;
  source: Source;
  kind: Kind;
  created_at: string;
}

export type TierKey = 'chosen' | 'trusted' | 'asset' | 'battery' | 'target';

export interface Tier {
  key: TierKey;
  title: string;
  code: string;
  verdict: string;
}

export interface SurvivalPoint {
  handle: string;
  display_name: string;
  survival: number;
}

export interface Distribution {
  n: number;
  mean: number;
  sd: number;
  min_attempts: number;
  values: SurvivalPoint[];
}

export interface SurvivalReport {
  handle: string;
  beautiful_threshold: number;
  attempts: number;
  passed: number;
  beautiful: number;
  beauty_rate: number;
  lv3: number;
  rage_quits: number;
  survival: number;
  tier: Tier;
  eligible: boolean;
  attempts_needed: number;
  percentile: number | null;
  z: number | null;
  rank: number | null;
  out_of: number;
  distribution: Distribution;
}

export interface PlayerProfile {
  player: PlayerRef & { created_at: string };
  totals: {
    attempts: number;
    passed: number;
    beautiful: number;
    pass_rate: number;
    avg_score: number;
    lv3: number;
    rage_quits: number;
    forgives: number;
  };
  best: WaiRef | null;
  streak: { current: number; best: number };
  levels: [number, number, number, number];
  daily: { day: string; passed: number }[];
  badges: string[];
  ranks: { survival_all: number | null; beauty_week: number | null; count_week: number | null };
  survival: SurvivalReport;
}

export interface WaiSubmission {
  id: string;
  session_id: string;
  source: Source;
  kind: Kind;
  level: Level;
  score: number;
  hold_ms: number;
  passed: boolean;
  action: Action;
  forgave: boolean;
  anger: number;
  client_ts: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; field?: string };
}
