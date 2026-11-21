// プレイヤー名とフレンド機能
// - players/{uid}: 公開プロフィール（名前・レベル・称号・連続日数）。アカウントIDを知っている人だけが読める
// - playerNames/{名前のキー}: 名前 → アカウントID。名前は1人1つの早い者勝ち。名前を知っている人だけが引ける
// - players/{uid}/friends/{相手のuid}: 自分のフレンド一覧（本人だけが読み書き）
// Google アカウントの名前は使わない。ログイン後に本人が決めた名前だけを使う
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const MAX_NAME_LENGTH = 20;
export const MAX_FRIENDS = 50;

export interface PlayerProfile {
  uid: string;
  name: string;
  level: number;
  title: string;
  streakDays: number;
}

export const normalizeName = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);

// 大文字・小文字、全角・半角、前後の空白の違いは同じ名前として扱う
export const nameKey = (name: string) => encodeURIComponent(normalizeName(name).normalize('NFKC').toLowerCase());

// ===== 端末に覚えておく自分の名前（オフラインでもすぐ表示できるように。アカウントごと） =====
const cacheKey = (uid: string) => `player_name_${uid}`;
export const getCachedName = (uid: string): string => {
  try {
    return localStorage.getItem(cacheKey(uid)) ?? '';
  } catch {
    return '';
  }
};
const setCachedName = (uid: string, name: string) => {
  try {
    localStorage.setItem(cacheKey(uid), name);
  } catch {
    // 無視
  }
};

// サーバーに登録済みの自分の名前（名前の登録が自分のものになっているときだけ返す）
export const loadMyName = async (uid: string): Promise<string | null> => {
  const snap = await getDoc(doc(db, 'players', uid));
  const name = snap.exists() ? ((snap.data() as { name?: string }).name ?? '') : '';
  if (!name) return null;
  const owner = await getDoc(doc(db, 'playerNames', nameKey(name)));
  if (!owner.exists() || (owner.data() as { uid?: string }).uid !== uid) return null;
  setCachedName(uid, name);
  return name;
};

export type ClaimResult = 'ok' | 'taken' | 'invalid';

// 名前を自分のものとして登録し、プロフィールの名前も変える。前の名前の登録は外す
export const claimPlayerName = async (uid: string, rawName: string, oldName?: string): Promise<ClaimResult> => {
  const name = normalizeName(rawName);
  const key = nameKey(name);
  if (!name || !key) return 'invalid';
  const ref = doc(db, 'playerNames', key);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    if ((snap.data() as { uid?: string }).uid !== uid) return 'taken';
  } else {
    try {
      await setDoc(ref, { uid, name, updatedAt: serverTimestamp() });
    } catch {
      // ほぼ同時に誰かが登録した場合は書き込みが拒否される
      return 'taken';
    }
  }
  await setDoc(doc(db, 'players', uid), { name, updatedAt: serverTimestamp() }, { merge: true });
  if (oldName) {
    const oldKey = nameKey(oldName);
    if (oldKey && oldKey !== key) await deleteDoc(doc(db, 'playerNames', oldKey)).catch(() => undefined);
  }
  setCachedName(uid, name);
  return 'ok';
};

// 自分の公開プロフィールのうち、レベル・称号・連続日数を更新する（名前は claimPlayerName で変える）
export const savePlayerStats = async (uid: string, s: { level: number; title: string; streakDays: number }) => {
  await setDoc(
    doc(db, 'players', uid),
    {
      level: Math.max(1, Math.min(100, Math.floor(s.level))),
      title: s.title.slice(0, 40),
      streakDays: Math.max(0, Math.floor(s.streakDays)),
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
};

export const fetchPlayer = async (uid: string): Promise<PlayerProfile | null> => {
  const snap = await getDoc(doc(db, 'players', uid));
  if (!snap.exists()) return null;
  const d = snap.data() as Partial<PlayerProfile>;
  return {
    uid,
    name: d.name || '冒険者',
    level: d.level ?? 1,
    title: d.title ?? '',
    streakDays: d.streakDays ?? 0
  };
};

// フレンド一覧（相手の最新のプロフィールを読み直す）
export const fetchFriends = async (uid: string): Promise<PlayerProfile[]> => {
  const snaps = await getDocs(collection(db, 'players', uid, 'friends'));
  const ids = snaps.docs.map((d) => d.id);
  const players = await Promise.all(ids.map((id) => fetchPlayer(id).catch(() => null)));
  return players.filter((p): p is PlayerProfile => p !== null);
};

// アカウントIDとして入力できる形か（Firebase の UID は英数字 28 文字前後）
export const isValidAccountId = (id: string) => /^[A-Za-z0-9_-]{6,128}$/.test(id);

const findUidByName = async (name: string): Promise<string | null> => {
  const key = nameKey(name);
  if (!key) return null;
  const snap = await getDoc(doc(db, 'playerNames', key));
  return snap.exists() ? ((snap.data() as { uid?: string }).uid ?? null) : null;
};

export type AddFriendResult = 'added' | 'self' | 'invalid' | 'not_found' | 'already' | 'full';

// プレイヤー名かアカウントIDで追加する（名前を先に探し、なければIDとして探す）
export const addFriend = async (myUid: string, nameOrId: string, currentIds: string[]): Promise<AddFriendResult> => {
  const text = nameOrId.trim();
  if (!normalizeName(text)) return 'invalid';
  const byName = await findUidByName(text);
  const id = byName ?? text;
  if (!byName && !isValidAccountId(id)) return 'not_found';
  if (id === myUid) return 'self';
  if (currentIds.includes(id)) return 'already';
  if (currentIds.length >= MAX_FRIENDS) return 'full';
  const player = await fetchPlayer(id);
  if (!player) return 'not_found';
  await setDoc(doc(db, 'players', myUid, 'friends', id), { addedAt: serverTimestamp() });
  return 'added';
};

export const removeFriend = async (myUid: string, friendId: string) => {
  await deleteDoc(doc(db, 'players', myUid, 'friends', friendId));
};
