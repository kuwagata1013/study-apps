// 記録期間（データ1・データ2 …）の管理
// 管理者が「次のデータを開始」すると Firestore settings/dataset の番号が上がる。
// 参加者の端末は次にアプリを開いたとき、それに追いついて進み具合（レベル・履歴など）を初期化する。
// 以降の学習ログ・行動データには新しい番号が付くので、前のデータは消えずに区別できる。
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const ROUND_KEY = 'dataset_round';
// 初期化するもの：ゲーム版・シンプル版の進み具合と、起動回数の通し番号
// （参加者ID・端末ID・選んだモード・プロフィール画像などは残す）
const WIPE_PREFIXES = ['gamified_', 'simple_'];
const WIPE_KEYS = ['research_launch_count'];

const SETTINGS_PATH = ['settings', 'dataset'] as const;
const FETCH_TIMEOUT_MS = 4000;

export const getLocalDataset = (): number => {
  try {
    return Math.max(1, Number(localStorage.getItem(ROUND_KEY)) || 1);
  } catch {
    return 1;
  }
};

const setLocalDataset = (n: number) => {
  try {
    localStorage.setItem(ROUND_KEY, String(n));
  } catch {
    // 無視
  }
};

const wipeLocalProgress = () => {
  try {
    Object.keys(localStorage)
      .filter((k) => WIPE_KEYS.includes(k) || WIPE_PREFIXES.some((p) => k.startsWith(p)))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // 無視
  }
};

// サーバー上の現在のデータ番号（未設定なら 1）
export const fetchCurrentDataset = async (): Promise<number> => {
  const snap = await getDoc(doc(db, ...SETTINGS_PATH));
  const current = snap.exists() ? Number(snap.data()?.current) : 1;
  return Number.isInteger(current) && current >= 1 ? current : 1;
};

// 管理者用：次のデータを開始する
export const startNextDataset = async (next: number) => {
  await setDoc(doc(db, ...SETTINGS_PATH), { current: next, updatedAt: serverTimestamp() });
};

// アプリ起動時、画面を出す前に 1 回だけ呼ぶ。
// 新しいデータが始まっていれば端末の進み具合を初期化し、その番号を返す（変化なしなら null）
export const syncDataset = async (): Promise<number | null> => {
  let current: number;
  try {
    current = await Promise.race([
      fetchCurrentDataset(),
      new Promise<number>((_, reject) => setTimeout(() => reject(new Error('timeout')), FETCH_TIMEOUT_MS))
    ]);
  } catch (e) {
    // 通信できないときは今の番号のまま続ける（次回の起動で追いつく）
    console.warn('データ番号を確認できませんでした:', e);
    return null;
  }
  const local = getLocalDataset();
  if (current === local) return null;
  if (current > local) wipeLocalProgress();
  setLocalDataset(current);
  return current > local ? current : null;
};
