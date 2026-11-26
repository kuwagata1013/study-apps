// 学習の記録（学習ログ・レベル・EXP・クエストなど）をアカウントごとにサーバーへ保存し、別の端末でも同じ記録を使えるようにする
// - progress/{uid}_{データ番号}: 端末の localStorage のうち、ゲーム版（gamified_）とシンプル版（simple_）の値をそのまま持つ
// - アプリを開いたとき（ログイン後、画面を出す前）にサーバーの記録と合わせ、そのあとは変わるたびにサーバーへ送る
// - 合わせ方：学習ログなどの一覧はどちらの端末の分も残す（足し合わせる）。レベル・EXP などの値は、新しく変えたほうを使う
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { getLocalDataset } from './dataset';

type Data = Record<string, string>;
interface Remote {
  data: Data;
  rev: string;
  savedAt: number;
}
// この端末が最後にサーバーと合わせたときの状態
interface Meta {
  uid: string;
  dataset: number;
  hash: string; // そのときの端末の記録
  changedAt: number; // 端末の記録が最後に変わった時刻
}

const META_KEY = 'progress_sync';
const PREFIXES = ['gamified_', 'simple_'];
const CHECK_MS = 5000; // 変わったかどうかを確かめる間隔
const PULL_TIMEOUT_MS = 6000;
const MAX_BYTES = 900_000; // Firestore の1件の上限（1MB）より少し小さく

const docRef = (uid: string, dataset: number) => doc(db, 'progress', `${uid}_${dataset}`);

// ===== 端末の記録 =====
const readLocal = (): Data => {
  const out: Data = {};
  try {
    for (const k of Object.keys(localStorage)) {
      if (!PREFIXES.some((p) => k.startsWith(p))) continue;
      const v = localStorage.getItem(k);
      if (v !== null) out[k] = v;
    }
  } catch {
    // 無視
  }
  return out;
};
const writeLocal = (data: Data) => {
  try {
    for (const k of Object.keys(readLocal())) if (!(k in data)) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
  } catch (e) {
    console.error('記録を端末に書けませんでした:', e);
  }
};

const hashOf = (data: Data) => {
  const text = JSON.stringify(Object.keys(data).sort().map((k) => [k, data[k]]));
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return `${(h >>> 0).toString(36)}:${text.length}`;
};

const readMeta = (): Meta | null => {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) || 'null') as Meta | null;
    return m && typeof m.uid === 'string' ? m : null;
  } catch {
    return null;
  }
};
const writeMeta = (m: Meta) => {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    // 無視
  }
};

// ===== 合わせ方 =====
const parseArray = (v: string): unknown[] | null => {
  try {
    const a = JSON.parse(v);
    return Array.isArray(a) ? a : null;
  } catch {
    return null;
  }
};
const itemKey = (x: unknown) => {
  if (x && typeof x === 'object' && 'id' in x) {
    const o = x as { id: unknown; dateKey?: unknown };
    return `id:${String(o.id)}|${String(o.dateKey ?? '')}`;
  }
  return JSON.stringify(x);
};
// 一覧はどちらの分も残す。学習ログ（id が作った時刻）は新しい順に並べ直す
const unionArrays = (a: unknown[], b: unknown[]) => {
  const seen = new Set(a.map(itemKey));
  const out = [...a, ...b.filter((x) => !seen.has(itemKey(x)))];
  const byTime = out.every((x) => x && typeof x === 'object' && /^\d{10,}$/.test(String((x as { id?: unknown }).id)));
  return byTime ? out.sort((x, y) => Number((y as { id: string }).id) - Number((x as { id: string }).id)) : out;
};

export const mergeProgress = (local: Data, remote: Data, localIsNewer: boolean): Data => {
  const out: Data = {};
  for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const l = local[k];
    const r = remote[k];
    if (l === undefined || r === undefined) {
      out[k] = (l ?? r) as string;
      continue;
    }
    const la = parseArray(l);
    const ra = parseArray(r);
    out[k] = la && ra ? JSON.stringify(unionArrays(localIsNewer ? la : ra, localIsNewer ? ra : la)) : localIsNewer ? l : r;
  }
  return out;
};

// ===== サーバー =====
const fetchRemote = async (uid: string, dataset: number): Promise<Remote | null> => {
  const snap = await getDoc(docRef(uid, dataset));
  if (!snap.exists()) return null;
  const d = snap.data() as Partial<Remote>;
  const data: Data = {};
  if (d.data && typeof d.data === 'object') {
    for (const [k, v] of Object.entries(d.data)) if (typeof v === 'string' && PREFIXES.some((p) => k.startsWith(p))) data[k] = v;
  }
  return { data, rev: typeof d.rev === 'string' ? d.rev : '', savedAt: typeof d.savedAt === 'number' ? d.savedAt : 0 };
};

const saveRemote = async (uid: string, dataset: number, data: Data, savedAt: number) => {
  const bytes = Object.entries(data).reduce((n, [k, v]) => n + k.length + v.length, 0);
  if (bytes > MAX_BYTES) throw new Error(`記録が大きすぎて保存できません（${bytes} 文字）`);
  await setDoc(docRef(uid, dataset), {
    uid,
    dataset,
    data,
    rev: Math.random().toString(36).slice(2, 12),
    savedAt: Math.round(savedAt),
    updatedAt: serverTimestamp()
  });
};

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

// ===== アプリを開いたとき（画面を出す前に1回） =====
// サーバーの記録と端末の記録を合わせて、端末に書く。通信できなければ端末の記録のまま続ける
export const pullProgress = async (uid: string) => {
  const dataset = getLocalDataset();
  const meta = readMeta();
  const local = readLocal();
  const localHash = hashOf(local);
  const changedAt = meta && meta.hash === localHash ? meta.changedAt : Date.now();
  try {
    const remote = await withTimeout(fetchRemote(uid, dataset), PULL_TIMEOUT_MS);
    // 端末に残っているのが別のアカウントの記録なら使わない（その人の記録はその人のアカウントに保存済み）
    const otherAccount = !!meta && meta.uid !== uid;
    let merged: Data;
    if (otherAccount) merged = remote?.data ?? {};
    else if (!remote) merged = local;
    else if (meta && meta.dataset === dataset && meta.hash === localHash && meta.changedAt <= remote.savedAt) merged = remote.data;
    else merged = mergeProgress(local, remote.data, changedAt >= remote.savedAt);
    const mergedHash = hashOf(merged);
    if (mergedHash !== localHash) writeLocal(merged);
    const savedAt = remote && mergedHash === hashOf(remote.data) ? remote.savedAt : Math.max(changedAt, remote?.savedAt ?? 0);
    if (!remote || mergedHash !== hashOf(remote.data)) await saveRemote(uid, dataset, merged, savedAt);
    writeMeta({ uid, dataset, hash: mergedHash, changedAt: savedAt });
  } catch (e) {
    console.warn('記録をサーバーと合わせられませんでした（この端末の記録で続けます）:', e);
  }
};

// ===== 開いている間：変わったらサーバーへ送る =====
// 送るたびにサーバーの記録と合わせる（ほかの端末で増えた学習ログを消さないため）。端末の画面はそのまま
export const startProgressSync = (uid: string) => {
  let busy = false;
  const push = async () => {
    if (busy) return;
    const dataset = getLocalDataset();
    const meta = readMeta();
    const local = readLocal();
    const hash = hashOf(local);
    // 端末の記録が別のアカウントのものなら送らない（次に開いたときの pullProgress で入れ替える）
    if (meta && meta.uid !== uid) return;
    if (meta && meta.dataset === dataset && meta.hash === hash) return;
    busy = true;
    const changedAt = Date.now();
    try {
      const remote = await fetchRemote(uid, dataset);
      const merged = remote ? mergeProgress(local, remote.data, true) : local;
      await saveRemote(uid, dataset, merged, changedAt);
      writeMeta({ uid, dataset, hash, changedAt });
    } catch (e) {
      console.warn('記録をサーバーに保存できませんでした（あとでもう一度送ります）:', e);
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void push(), CHECK_MS);
  const onHide = () => {
    if (document.visibilityState === 'hidden') void push();
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onHide);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onHide);
  };
};

// ===== 管理者用：パスワードの再発行で新しいアカウントへ移す（toUid が null なら消す） =====
export const moveProgress = async (fromUid: string, toUid: string | null) => {
  const snaps = await getDocs(query(collection(db, 'progress'), where('uid', '==', fromUid)));
  for (const d of snaps.docs) {
    const v = d.data() as { dataset?: number; data?: Data; savedAt?: number };
    if (toUid && typeof v.dataset === 'number' && v.data) await saveRemote(toUid, v.dataset, v.data, v.savedAt ?? Date.now());
    await deleteDoc(doc(db, 'progress', d.id));
  }
};
