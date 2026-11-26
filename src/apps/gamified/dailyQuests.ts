// ゲーム版のデイリークエスト
// - 管理画面で決めた候補（settings/quests）から、毎日決まった数を全員に同じように出す（日付から決める）
// - 記録したときに、その日の記録から自動で判定する
import { dayKey, logDay } from './gameStatsUtils';
import { getQuestConfig, QUEST_SUBJECTS, type QuestConfig, type QuestKind, type QuestTemplate } from '../../lib/questConfig';

export interface DailyQuest {
  id: string; // 例: 2026-11-22:normal-total（日付:候補のID）
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

// 全部達成したときのクリアボーナス
export const allClearExp = () => getQuestConfig().allClearExp;

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

export const describeQuest = (kind: QuestKind, target: number, subject: string): { title: string; unit: string } => {
  switch (kind) {
    case 'subject':
      return { title: `${subject}を${target}分勉強する`, unit: '分' };
    case 'total':
      return { title: `今日合計${target}分勉強する`, unit: '分' };
    case 'subjects':
      return { title: `${target}教科を勉強する`, unit: '教科' };
    case 'sessions':
      return { title: `${target}回に分けて記録する`, unit: '回' };
    case 'focus':
      return { title: `止めずに${target}分続ける`, unit: '分' };
    case 'countdown':
      return { title: `減算タイマー${target}分以上を最後まで走りきる`, unit: '回' };
  }
};

const toQuest = (t: QuestTemplate, key: string): DailyQuest => {
  const subject =
    t.kind === 'subject'
      ? t.subject && t.subject !== 'random'
        ? t.subject
        : QUEST_SUBJECTS[hash(`${key}:${t.id}:subject`) % QUEST_SUBJECTS.length]
      : '';
  const { title, unit } = describeQuest(t.kind, t.target, subject);
  return { id: `${key}:${t.id}`, kind: t.kind, title, target: t.target, unit, subject: subject || undefined, exp: t.exp };
};

// その日のクエスト。候補を日付で並べかえて、先頭から決まった数を選ぶ（EXP の少ない順に並べて出す）
export const questsFor = (date: Date, config: QuestConfig = getQuestConfig()): DailyQuest[] => {
  const key = dayKey(date);
  return [...config.pool]
    .map((t) => ({ t, order: hash(`${key}:${t.id}`) }))
    .sort((a, b) => a.order - b.order)
    .slice(0, config.perDay)
    .map(({ t }) => toQuest(t, key))
    .sort((a, b) => a.exp - b.exp);
};

const minutesOf = (l: QuestLog) => (l.durationSeconds ?? l.durationMinutes * 60) / 60;

// 今の進み具合（クエストの単位で）
export const questProgress = (q: DailyQuest, logs: QuestLog[], date: Date): number => {
  const key = dayKey(date);
  const today = logs.filter((l) => dayKey(logDay(l)) === key);
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

// ===== 受け取りの記録（EXP を二重に渡さないため） =====
export interface QuestClear {
  id: string; // クエストのID（日付:候補のID）
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
