// プレイヤー名とフレンド機能
// - players/{uid}: 公開プロフィール（名前・レベル・称号・連続日数・今日と今週の勉強時間）。アカウントIDを知っている人だけが読める
// - playerNames/{名前のキー}: 名前 → アカウントID。名前は1人1つの早い者勝ち。名前を知っている人だけが引ける
// - players/{uid}/friends/{相手のuid}: 自分のフレンド一覧（読めるのは本人だけ）
// - friendRequests/{申請した人のuid}_{相手のuid}: フレンド申請。相手が承認するとお互いの一覧に入る
// Google アカウントの名前は使わない。ログイン後に本人が決めた名前だけを使う
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

export const MAX_NAME_LENGTH = 20;
export const MAX_FRIENDS = 50;

export interface PlayerProfile {
  uid: string;
  name: string;
  level: number;
  title: string;
  streakDays: number;
  todayMinutes: number; // その日の勉強時間（分）
  todayKey: string; // todayMinutes の日付（YYYY-MM-DD）。今日と違えば 0 分として扱う
  weekMinutes: number; // その週（月曜〜日曜）の勉強時間（分）
  weekDays: number[]; // その週の日ごとの勉強時間（分）。月曜から日曜の7つ
  weekKey: string; // その週の月曜の日付（YYYY-MM-DD）。今週と違えば 0 分として扱う
}

export const normalizeName = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);

// 名前の登録に使うキー。大文字・小文字、全角・半角は別の名前として扱う（前後の空白と、続いた空白だけはまとめる）
export const nameKey = (name: string) => encodeURIComponent(normalizeName(name));
// 以前の版のキー（大文字・小文字、全角・半角を同じとみなしていた）。登録済みの人を新しいキーへ移すために使う
const legacyNameKey = (name: string) => encodeURIComponent(normalizeName(name).normalize('NFKC').toLowerCase());
// Firestore のドキュメントIDに使えないもの（「.」「..」「__名前__」）
const isUsableKey = (key: string) => !!key && key !== '.' && key !== '..' && !/^__.*__$/.test(key);

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
  const key = nameKey(name);
  const owner = await getDoc(doc(db, 'playerNames', key));
  if (owner.exists()) {
    if ((owner.data() as { uid?: string }).uid !== uid) return null;
  } else {
    // 以前の版のキーで登録されていたら、新しいキーに登録し直す
    const legacy = legacyNameKey(name);
    if (legacy === key || !isUsableKey(key)) return null;
    const old = await getDoc(doc(db, 'playerNames', legacy));
    if (!old.exists() || (old.data() as { uid?: string }).uid !== uid) return null;
    try {
      await setDoc(doc(db, 'playerNames', key), { uid, name, updatedAt: serverTimestamp() });
    } catch {
      return null;
    }
    await deleteDoc(doc(db, 'playerNames', legacy)).catch(() => undefined);
  }
  setCachedName(uid, name);
  return name;
};

export type ClaimResult = 'ok' | 'taken' | 'invalid';

// 名前を自分のものとして登録し、プロフィールの名前も変える。前の名前の登録は外す
export const claimPlayerName = async (uid: string, rawName: string, oldName?: string): Promise<ClaimResult> => {
  const name = normalizeName(rawName);
  const key = nameKey(name);
  if (!name || !isUsableKey(key)) return 'invalid';
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
    // 前の名前の登録を外す（以前の版のキーで残っていればそれも）
    // 自分の登録だけを外す（以前の版のキーは別の人が使っていることもある）
    for (const oldKey of new Set([nameKey(oldName), legacyNameKey(oldName)])) {
      if (!isUsableKey(oldKey) || oldKey === key) continue;
      const ref = doc(db, 'playerNames', oldKey);
      const old = await getDoc(ref).catch(() => null);
      if (old?.exists() && (old.data() as { uid?: string }).uid === uid) await deleteDoc(ref).catch(() => undefined);
    }
  }
  setCachedName(uid, name);
  return 'ok';
};

// 自分の公開プロフィールのうち、レベル・称号・連続日数を更新する（名前は claimPlayerName で変える）
export const savePlayerStats = async (
  uid: string,
  s: { level: number; title: string; streakDays: number; todayMinutes: number; todayKey: string; weekDays: number[]; weekKey: string }
) => {
  const days = Array.from({ length: 7 }, (_, i) => Math.max(0, Math.min(1440, Math.round(s.weekDays[i] ?? 0))));
  await setDoc(
    doc(db, 'players', uid),
    {
      level: Math.max(1, Math.min(100000, Math.floor(s.level))),
      title: s.title.slice(0, 40),
      streakDays: Math.max(0, Math.floor(s.streakDays)),
      todayMinutes: Math.max(0, Math.min(1440, Math.round(s.todayMinutes))),
      todayKey: s.todayKey,
      weekMinutes: days.reduce((a, b) => a + b, 0),
      weekDays: days,
      weekKey: s.weekKey,
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
    streakDays: d.streakDays ?? 0,
    todayMinutes: d.todayMinutes ?? 0,
    todayKey: d.todayKey ?? '',
    weekMinutes: d.weekMinutes ?? 0,
    weekDays: Array.isArray(d.weekDays) && d.weekDays.length === 7 ? d.weekDays.map((n) => (typeof n === 'number' ? n : 0)) : [0, 0, 0, 0, 0, 0, 0],
    weekKey: d.weekKey ?? ''
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
  if (!isUsableKey(key)) return null;
  const snap = await getDoc(doc(db, 'playerNames', key));
  if (snap.exists()) {
    // 以前の版の登録は小文字のキーに別の書き方の名前が入っていることがあるので、名前も同じか確かめる
    const d = snap.data() as { uid?: string; name?: string };
    if (d.name === normalizeName(name)) return d.uid ?? null;
  }
  // 以前の版のキーのまま（まだ新しい版を開いていない人）。名前が完全に同じときだけ見つかったことにする
  const legacy = legacyNameKey(name);
  if (legacy === key || !isUsableKey(legacy)) return null;
  const old = await getDoc(doc(db, 'playerNames', legacy));
  if (!old.exists()) return null;
  const d = old.data() as { uid?: string; name?: string };
  return d.name === normalizeName(name) ? (d.uid ?? null) : null;
};

// ===== フレンド申請 =====
const requestRef = (from: string, to: string) => doc(db, 'friendRequests', `${from}_${to}`);

const fetchPlayers = async (ids: string[]) =>
  (await Promise.all(ids.map((id) => fetchPlayer(id).catch(() => null)))).filter((p): p is PlayerProfile => p !== null);

// 届いた申請（incoming）と送った申請（outgoing）。相手のプロフィール付き
export const fetchFriendRequests = async (uid: string): Promise<{ incoming: PlayerProfile[]; outgoing: PlayerProfile[] }> => {
  const col = collection(db, 'friendRequests');
  const [inc, out] = await Promise.all([getDocs(query(col, where('to', '==', uid))), getDocs(query(col, where('from', '==', uid)))]);
  const [incoming, outgoing] = await Promise.all([
    fetchPlayers(inc.docs.map((d) => (d.data() as { from: string }).from)),
    fetchPlayers(out.docs.map((d) => (d.data() as { to: string }).to))
  ]);
  return { incoming, outgoing };
};

// 届いた申請の数（タブの印に使う）
export const countIncomingRequests = async (uid: string) =>
  (await getDocs(query(collection(db, 'friendRequests'), where('to', '==', uid)))).size;

export interface FriendState {
  friendIds: string[];
  incomingIds: string[];
  outgoingIds: string[];
}

// 申請を承認する：お互いのフレンド一覧に入れて、申請を消す（まとめて書くので、途中で失敗しても片方だけにはならない）
export const acceptFriendRequest = async (myUid: string, fromUid: string, state: FriendState) => {
  const batch = writeBatch(db);
  // 以前の版で自分の一覧にだけ入っている相手なら、自分の側は書かない（書き換えはできないため）
  if (!state.friendIds.includes(fromUid)) batch.set(doc(db, 'players', myUid, 'friends', fromUid), { addedAt: serverTimestamp() });
  batch.set(doc(db, 'players', fromUid, 'friends', myUid), { addedAt: serverTimestamp() });
  batch.delete(requestRef(fromUid, myUid));
  // 自分からも申請していたら、それも消す
  if (state.outgoingIds.includes(fromUid)) batch.delete(requestRef(myUid, fromUid));
  await batch.commit();
};

export const declineFriendRequest = async (myUid: string, fromUid: string) => {
  await deleteDoc(requestRef(fromUid, myUid));
};

export const cancelFriendRequest = async (myUid: string, toUid: string) => {
  await deleteDoc(requestRef(myUid, toUid));
};

export type SendRequestResult = 'sent' | 'accepted' | 'self' | 'invalid' | 'not_found' | 'already' | 'pending' | 'full';

// プレイヤー名かアカウントIDで申請する（名前を先に探し、なければIDとして探す）
// 相手からすでに申請が届いていれば、それを承認してフレンドになる
export const sendFriendRequest = async (myUid: string, nameOrId: string, state: FriendState): Promise<SendRequestResult> => {
  const text = nameOrId.trim();
  if (!normalizeName(text)) return 'invalid';
  const byName = await findUidByName(text);
  const id = byName ?? text;
  if (!byName && !isValidAccountId(id)) return 'not_found';
  if (id === myUid) return 'self';
  if (state.friendIds.includes(id)) return 'already';
  if (state.outgoingIds.includes(id)) return 'pending';
  if (state.friendIds.length >= MAX_FRIENDS) return 'full';
  if (state.incomingIds.includes(id)) {
    await acceptFriendRequest(myUid, id, state);
    return 'accepted';
  }
  const player = await fetchPlayer(id);
  if (!player) return 'not_found';
  await setDoc(requestRef(myUid, id), { from: myUid, to: id, createdAt: serverTimestamp() });
  return 'sent';
};

// フレンドから外す（お互いの一覧から消す）
export const removeFriend = async (myUid: string, friendId: string) => {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'players', myUid, 'friends', friendId));
  batch.delete(doc(db, 'players', friendId, 'friends', myUid));
  await batch.commit();
};
