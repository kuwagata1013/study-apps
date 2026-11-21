// ゲーム版の学習記録の集計に使う型と関数

export interface StatsLog {
  id: string;
  subject: string;
  durationMinutes: number;
  expGained: number;
  createdAt: string;
  memo: string;
}

export interface StatsTask {
  id: string;
  completed: boolean;
}

export const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// 記録した時刻（ID は保存時の Date.now()。読めなければ表示用の日時文字列から）
export const logTime = (log: StatsLog): Date => {
  const n = Number(log.id);
  if (Number.isFinite(n) && n > 1e12) return new Date(n);
  const parsed = new Date(log.createdAt.replace(/\//g, '-'));
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
};

export const formatMinutes = (m: number) => {
  const total = Math.round(m);
  if (total < 60) return `${total}分`;
  const h = Math.floor(total / 60);
  const r = total % 60;
  return r ? `${h}時間${r}分` : `${h}時間`;
};

// 学習した日（ライフクリスタルで守った日も含める）
const studyDays = (logs: StatsLog[], protectedDays: string[] = []) =>
  new Set([...logs.map((l) => dayKey(logTime(l))), ...protectedDays]);

const countBack = (days: Set<string>, from: Date) => {
  const d = new Date(from);
  let count = 0;
  while (days.has(dayKey(d))) {
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
};

// 今日（まだなら昨日）からさかのぼって、続けて学習した日数
export const studyStreak = (logs: StatsLog[], protectedDays: string[] = []) => {
  const days = studyDays(logs, protectedDays);
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  return countBack(days, d);
};

// 昨日までの連続日数（今日の連続ボーナスの計算に使う）
export const streakUntilYesterday = (logs: StatsLog[], protectedDays: string[] = []) => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return countBack(studyDays(logs, protectedDays), d);
};

// 連続ボーナス：昨日までの連続1日ごとに +10%、最大 +50%
export const STREAK_BONUS_STEP = 0.1;
export const STREAK_BONUS_MAX = 0.5;
export const streakBonusRate = (daysBefore: number) => Math.min(STREAK_BONUS_MAX, daysBefore * STREAK_BONUS_STEP);

// 最後に学習した日の翌日から昨日までの、学習しなかった日（ライフクリスタルで埋める候補）
export const missedDays = (logs: StatsLog[], protectedDays: string[] = []): string[] => {
  const days = studyDays(logs, protectedDays);
  if (days.size === 0) return [];
  const today = dayKey(new Date());
  const last = [...days].filter((k) => k < today).sort().pop();
  if (!last) return [];
  const out: string[] = [];
  const d = new Date();
  d.setDate(d.getDate() - 1);
  while (dayKey(d) > last) {
    out.push(dayKey(d));
    d.setDate(d.getDate() - 1);
  }
  return out.reverse();
};

// ライフクリスタル：連続7日ごとに1個もらえる
export const CRYSTAL_STREAK_STEP = 7;
// 集中ボーナス：止めずに25分続けると宝箱
export const FOCUS_BONUS_SECONDS = 25 * 60;

// ===== レベル =====
// レベルに上限はない。次のレベルに必要な EXP は 100 から始まり、1レベルごとに 10 ずつ増える
// （Lv1→2 は 100 EXP ≒ 5分、Lv99→100 は 1,080 EXP ≒ 54分、Lv100 まで合計 58,410 EXP ≒ 49時間）
// Lv100 は称号「伝説の冒険者」がもらえる節目（到達時は特別な演出）
export const LEGEND_LEVEL = 100;
export const expToNext = (level: number) => 100 + 10 * (level - 1);

// Lv1 から数えた累計 EXP
export const totalExpAt = (level: number, exp = 0) => {
  const n = Math.max(0, level - 1);
  return 100 * n + 5 * n * (n - 1) + exp;
};

// EXP を足したあとのレベルと EXP（上限なし）
export const applyExp = (level: number, exp: number, gained: number) => {
  let lv = Math.max(1, Math.floor(level) || 1);
  let e = Math.max(0, exp) + Math.max(0, gained);
  while (e >= expToNext(lv)) {
    e -= expToNext(lv);
    lv += 1;
  }
  return { level: lv, exp: e };
};

// 称号：このレベルに達するともらえる（Lv100 の「伝説の冒険者」の先にも上位の称号がある）
export const TITLES: { level: number; name: string }[] = [
  { level: 1, name: '見習い冒険者' },
  { level: 5, name: '駆け出しの冒険者' },
  { level: 10, name: '一人前の冒険者' },
  { level: 20, name: '熟練の冒険者' },
  { level: 30, name: 'ベテラン冒険者' },
  { level: 45, name: '英雄' },
  { level: 60, name: '勇者' },
  { level: 75, name: '賢者' },
  { level: 90, name: '大賢者' },
  { level: 100, name: '伝説の冒険者' },
  { level: 120, name: '伝説の英雄' },
  { level: 150, name: '英雄王' },
  { level: 200, name: '神話の勇者' },
  { level: 250, name: '星詠みの大賢者' },
  { level: 300, name: '天空の覇者' },
  { level: 400, name: '時を越えし者' },
  { level: 500, name: '永遠の伝説' }
];

// いちばん上の称号
export const FINAL_TITLE = TITLES[TITLES.length - 1];

export const levelTitle = (level: number) =>
  [...TITLES].reverse().find((t) => level >= t.level)?.name ?? TITLES[0].name;

export const nextTitle = (level: number) => TITLES.find((t) => t.level > level) ?? null;
// 学習時間の EXP（1分あたり）
export const EXP_PER_MINUTE = 20;
// 集中ボーナスの宝箱：EXP と、ライフクリスタルが入っている確率
export const FOCUS_BONUS_EXP = 100;
export const CHEST_CRYSTAL_CHANCE = 0.2;
