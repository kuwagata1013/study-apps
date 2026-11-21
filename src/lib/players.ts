// フレンド機能：プレイヤーの公開プロフィール（players/{uid}）と、自分のフレンド一覧（players/{uid}/friends/{相手のuid}）
// 公開プロフィールはアカウントIDを知っている人だけが読める（一覧表示はできない）
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

const NAME_KEY = 'gamified_player_name';

// 端末に覚えておくプレイヤー名（ログインしていなくても使える）
export const getLocalPlayerName = (): string => {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
};
export const setLocalPlayerName = (name: string) => {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // 無視
  }
};

export const normalizeName = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);

// 自分の公開プロフィールを保存する
export const savePlayer = async (p: PlayerProfile) => {
  await setDoc(doc(db, 'players', p.uid), {
    name: normalizeName(p.name) || '冒険者',
    level: Math.max(1, Math.min(100, Math.floor(p.level))),
    title: p.title.slice(0, 40),
    streakDays: Math.max(0, Math.floor(p.streakDays)),
    updatedAt: serverTimestamp()
  });
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

export type AddFriendResult = 'added' | 'self' | 'invalid' | 'not_found' | 'already' | 'full';

export const addFriend = async (myUid: string, friendId: string, currentIds: string[]): Promise<AddFriendResult> => {
  const id = friendId.trim();
  if (!isValidAccountId(id)) return 'invalid';
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
