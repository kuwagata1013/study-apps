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

// 今日（まだなら昨日）からさかのぼって、続けて学習した日数
export const studyStreak = (logs: StatsLog[]) => {
  const days = new Set(logs.map((l) => dayKey(logTime(l))));
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let count = 0;
  while (days.has(dayKey(d))) {
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
};

export const levelTitle = (level: number) => {
  if (level < 3) return '見習い冒険者';
  if (level < 6) return '駆け出しの冒険者';
  if (level < 10) return '熟練の冒険者';
  return '伝説の冒険者';
};
