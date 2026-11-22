// ゲーム版のデイリークエスト
// - 毎日「かんたん・ふつう・むずかしい」を1つずつ、全員に同じものを出す（日付から決める）
// - 記録したときに、その日の記録から自動で判定する
// - 難しさの水準は実験の間ずっと同じ（研究の条件をそろえるため）
import { dayKey, logTime } from './gameStatsUtils';

export type QuestTier = 'easy' | 'normal' | 'hard';
type QuestKind = 'subject' | 'total' | 'subjects' | 'sessions' | 'focus' | 'countdown';

export interface DailyQuest {
  id: string; // 例: 2026-11-22:normal
  tier: QuestTier;
  kind: QuestKind;
  title: string;
  target: number; // 分・教科数・回数
  unit: string;
  subject?: string;
  exp: number;
}

// クエストの判定に使う記録（ゲーム版の学習記録）
export interface QuestLog {
  id: string;
  subject: string;
  durationMinutes: number;
  durationSeconds?: number;
  createdAt: string;
  memo: string;
  expGained: number;
  bestRunSeconds?: number; // 止めずに続けた最長の秒数
  countdownMinutes?: number; // 減算タイマーを最後まで走りきったときの設定時間
}

export const TIER_LABEL: Record<QuestTier, string> = { easy: 'かんたん', normal: 'ふつう', hard: 'むずかしい' };
export const TIER_EXP: Record<QuestTier, number> = { easy: 50, normal: 100, hard: 150 };
export const ALL_CLEAR_EXP = 100;

const SUBJECTS = ['国語', '数学', '英語', '理科', '社会'];

type Template = { kind: QuestKind; target: number };
const POOLS: Record<QuestTier, Template[]> = {
  easy: [
    { kind: 'subject', target: 10 },
    { kind: 'total', target: 15 },
    { kind: 'focus', target: 10 }
  ],
  normal: [
    { kind: 'subject', target: 20 },
    { kind: 'total', target: 30 },
    { kind: 'subjects', target: 2 },
    { kind: 'sessions', target: 2 },
    { kind: 'countdown', target: 15 }
  ],
  hard: [
    { kind: 'subject', target: 40 },
    { kind: 'total', target: 60 },
    { kind: 'subjects', target: 3 },
    { kind: 'focus', target: 30 }
  ]
};

// 日付の文字列から決まる数（全員同じになるように、乱数は使わない）
const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // 似た日付でも結果がばらけるように、最後によく混ぜる
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};

const describe = (t: Template, subject: string): { title: string; unit: string } => {
  switch (t.kind) {
    case 'subject':
      return { title: `${subject}を${t.target}分勉強する`, unit: '分' };
    case 'total':
      return { title: `今日合計${t.target}分勉強する`, unit: '分' };
    case 'subjects':
      return { title: `${t.target}教科を勉強する`, unit: '教科' };
    case 'sessions':
      return { title: `${t.target}回に分けて記録する`, unit: '回' };
    case 'focus':
      return { title: `止めずに${t.target}分続ける`, unit: '分' };
    case 'countdown':
      return { title: `減算タイマー${t.target}分以上を最後まで走りきる`, unit: '回' };
  }
};

export const questsFor = (date: Date): DailyQuest[] => {
  const key = dayKey(date);
  return (['easy', 'normal', 'hard'] as QuestTier[]).map((tier) => {
    const pool = POOLS[tier];
    const t = pool[hash(`${key}:${tier}`) % pool.length];
    const subject = SUBJECTS[hash(`${key}:${tier}:subject`) % SUBJECTS.length];
    const { title, unit } = describe(t, subject);
    return {
      id: `${key}:${tier}`,
      tier,
      kind: t.kind,
      title,
      target: t.target,
      unit,
      subject: t.kind === 'subject' ? subject : undefined,
      exp: TIER_EXP[tier]
    };
  });
};

const minutesOf = (l: QuestLog) => (l.durationSeconds ?? l.durationMinutes * 60) / 60;

// 今の進み具合（クエストの単位で）
export const questProgress = (q: DailyQuest, logs: QuestLog[], date: Date): number => {
  const key = dayKey(date);
  const today = logs.filter((l) => dayKey(logTime(l)) === key);
  switch (q.kind) {
    case 'subject':
      return Math.floor(today.filter((l) => l.subject === q.subject).reduce((s, l) => s + minutesOf(l), 0));
    case 'total':
      return Math.floor(today.reduce((s, l) => s + minutesOf(l), 0));
    case 'subjects':
      return new Set(today.map((l) => l.subject)).size;
    case 'sessions':
      return today.length;
    case 'focus':
      return Math.floor(Math.max(0, ...today.map((l) => l.bestRunSeconds ?? 0)) / 60);
    case 'countdown':
      return today.filter((l) => (l.countdownMinutes ?? 0) >= q.target).length > 0 ? 1 : 0;
  }
};

export const questTarget = (q: DailyQuest) => (q.kind === 'countdown' ? 1 : q.target);
export const isQuestDone = (q: DailyQuest, logs: QuestLog[], date: Date) => questProgress(q, logs, date) >= questTarget(q);

// ===== クリアの記録（EXP を二重に渡さないため） =====
export interface QuestClear {
  id: string; // クエストのID（日付:難しさ）
  title: string;
  dateKey: string;
  exp: number;
}
const CLEAR_KEY = 'gamified_quest_clears';
const ALL_CLEAR_KEY = 'gamified_quest_all_clear_days';

export const loadQuestClears = (): QuestClear[] => {
  try {
    const v = JSON.parse(localStorage.getItem(CLEAR_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
export const saveQuestClears = (clears: QuestClear[]) => localStorage.setItem(CLEAR_KEY, JSON.stringify(clears));

export const loadAllClearDays = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(ALL_CLEAR_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
export const saveAllClearDays = (days: string[]) => localStorage.setItem(ALL_CLEAR_KEY, JSON.stringify(days));
