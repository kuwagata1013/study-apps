// ゲーム版デイリークエストの設定（管理画面で変える）
// Firestore settings/quests に保存し、全員が同じ設定を使う。
// アプリを開いたときに読み込んで端末に覚えておく（通信できないときは覚えている設定か、初期設定を使う）
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export type QuestKind = 'subject' | 'total' | 'subjects' | 'sessions' | 'focus' | 'countdown';

// 教科を決めるクエストの教科（random は日替わり）
export const QUEST_SUBJECTS = ['国語', '数学', '英語', '理科', '社会'] as const;
export type QuestSubject = (typeof QUEST_SUBJECTS)[number] | 'random';

export interface QuestTemplate {
  id: string;
  kind: QuestKind;
  target: number; // 分・教科数・回数
  exp: number;
  subject?: QuestSubject; // kind が subject のときだけ
}

export interface QuestConfig {
  perDay: number; // 1日に出す数
  allClearExp: number; // 全部達成したときのクリアボーナス
  pool: QuestTemplate[]; // 出てくるクエストの候補
}

export const QUEST_KIND_INFO: Record<QuestKind, { label: string; unit: string; min: number; max: number }> = {
  subject: { label: '教科を○分', unit: '分', min: 1, max: 300 },
  total: { label: '今日合計○分', unit: '分', min: 1, max: 600 },
  subjects: { label: '○教科を勉強', unit: '教科', min: 2, max: 6 },
  sessions: { label: '○回に分けて記録', unit: '回', min: 2, max: 10 },
  focus: { label: '止めずに○分', unit: '分', min: 1, max: 180 },
  countdown: { label: '減算タイマー○分以上を完走', unit: '分', min: 1, max: 180 }
};
export const QUEST_KINDS = Object.keys(QUEST_KIND_INFO) as QuestKind[];

export const PER_DAY_MIN = 1;
export const PER_DAY_MAX = 6;
export const POOL_MAX = 40;
export const EXP_MAX = 1000;

// 初期設定（これまでの「かんたん・ふつう・むずかしい」の候補と同じ）
export const DEFAULT_QUEST_CONFIG: QuestConfig = {
  perDay: 3,
  allClearExp: 100,
  pool: [
    { id: 'easy-subject', kind: 'subject', target: 10, exp: 50, subject: 'random' },
    { id: 'easy-total', kind: 'total', target: 15, exp: 50 },
    { id: 'easy-focus', kind: 'focus', target: 10, exp: 50 },
    { id: 'normal-subject', kind: 'subject', target: 20, exp: 100, subject: 'random' },
    { id: 'normal-total', kind: 'total', target: 30, exp: 100 },
    { id: 'normal-subjects', kind: 'subjects', target: 2, exp: 100 },
    { id: 'normal-sessions', kind: 'sessions', target: 2, exp: 100 },
    { id: 'normal-countdown', kind: 'countdown', target: 15, exp: 100 },
    { id: 'hard-subject', kind: 'subject', target: 40, exp: 150, subject: 'random' },
    { id: 'hard-total', kind: 'total', target: 60, exp: 150 },
    { id: 'hard-subjects', kind: 'subjects', target: 3, exp: 150 },
    { id: 'hard-focus', kind: 'focus', target: 30, exp: 150 }
  ]
};

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// 保存されていた設定を、使える形に整える（おかしな値は直すか取り除く）
export const sanitizeQuestConfig = (raw: unknown): QuestConfig => {
  const r = (raw ?? {}) as Partial<QuestConfig>;
  const pool = (Array.isArray(r.pool) ? r.pool : [])
    .filter((t): t is QuestTemplate => !!t && typeof t === 'object' && QUEST_KINDS.includes((t as QuestTemplate).kind))
    .slice(0, POOL_MAX)
    .map((t, i) => {
      const info = QUEST_KIND_INFO[t.kind];
      const subject =
        t.kind === 'subject'
          ? ((QUEST_SUBJECTS as readonly string[]).includes(t.subject ?? '') ? t.subject : 'random')
          : undefined;
      return {
        id: typeof t.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(t.id) ? t.id : `q${i}`,
        kind: t.kind,
        target: clampInt(t.target, info.min, info.max, info.min),
        exp: clampInt(t.exp, 0, EXP_MAX, 50),
        ...(subject ? { subject } : {})
      } as QuestTemplate;
    });
  if (pool.length === 0) return DEFAULT_QUEST_CONFIG;
  return {
    perDay: Math.min(pool.length, clampInt(r.perDay, PER_DAY_MIN, PER_DAY_MAX, 3)),
    allClearExp: clampInt(r.allClearExp, 0, EXP_MAX, 100),
    pool
  };
};

// ===== 端末に覚えておく設定 =====
const CACHE_KEY = 'quest_config';
let current: QuestConfig | null = null;

export const getQuestConfig = (): QuestConfig => {
  if (current) return current;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    current = raw ? sanitizeQuestConfig(JSON.parse(raw)) : DEFAULT_QUEST_CONFIG;
  } catch {
    current = DEFAULT_QUEST_CONFIG;
  }
  return current;
};

const setLocalQuestConfig = (config: QuestConfig) => {
  current = config;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(config));
  } catch {
    // 無視
  }
};

// ===== Firestore =====
const SETTINGS_PATH = ['settings', 'quests'] as const;

// サーバーの設定（まだ保存されていなければ初期設定）
export const fetchQuestConfig = async (): Promise<QuestConfig> => {
  const snap = await getDoc(doc(db, ...SETTINGS_PATH));
  return snap.exists() ? sanitizeQuestConfig(snap.data()) : DEFAULT_QUEST_CONFIG;
};

// アプリを開いたときに呼ぶ（最新の設定を端末に覚える）。通信できなければ今の設定のまま
export const syncQuestConfig = async (timeoutMs = 4000) => {
  try {
    const config = await Promise.race([
      fetchQuestConfig(),
      new Promise<QuestConfig>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
    ]);
    setLocalQuestConfig(config);
  } catch (e) {
    console.warn('クエストの設定を確認できませんでした:', e);
  }
};

// 管理者用：保存する（すぐに反映。次にアプリを開いた人から新しい設定になる）
export const saveQuestConfig = async (config: QuestConfig) => {
  const clean = sanitizeQuestConfig(config);
  await setDoc(doc(db, ...SETTINGS_PATH), { ...clean, updatedAt: serverTimestamp() });
  setLocalQuestConfig(clean);
  return clean;
};
