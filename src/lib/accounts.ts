// アカウントに結び付けた研究参加者ID（accounts/{uid}）
// - ログインしている人は、最初に使った参加者IDがアカウントに登録される
// - ほかの端末でもログインすれば同じIDになる。本人は変更できない（変えられるのは管理者だけ）
// - 読めるのは本人と管理者だけ（フレンドなどほかの人には見えない）
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { isValidParticipantId } from './participant';
import { nameKey } from './players';
import { moveProgress } from './progressSync';

// この端末の参加者IDが、どのアカウントから来たものか（ログアウトしたら消すため）
const OWNER_KEY = 'participant_id_owner';

export const getParticipantOwner = (): string => {
  try {
    return localStorage.getItem(OWNER_KEY) || '';
  } catch {
    return '';
  }
};

export const setParticipantOwner = (uid: string) => {
  try {
    localStorage.setItem(OWNER_KEY, uid);
  } catch {
    // 無視
  }
};

export const clearParticipantOwner = () => {
  try {
    localStorage.removeItem(OWNER_KEY);
  } catch {
    // 無視
  }
};

// アカウントに登録済みの参加者ID（なければ空文字）
export const loadAccountParticipantId = async (uid: string): Promise<string> => {
  const snap = await getDoc(doc(db, 'accounts', uid));
  const pid = snap.exists() ? ((snap.data() as { participantId?: string }).participantId ?? '') : '';
  return isValidParticipantId(pid) ? pid : '';
};

// 参加者IDをアカウントに登録する（1回だけ。登録済みなら書き込みは拒否される）
export const claimAccountParticipantId = async (uid: string, participantId: string) => {
  await setDoc(doc(db, 'accounts', uid), { participantId, createdAt: serverTimestamp() });
};

// ===== 管理者用 =====
export interface ParticipantAccount {
  uid: string;
  participantId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

const toDate = (v: unknown): Date | null =>
  v && typeof (v as { toDate?: unknown }).toDate === 'function' ? (v as { toDate: () => Date }).toDate() : null;

export const fetchParticipantAccounts = async (): Promise<ParticipantAccount[]> => {
  const snaps = await getDocs(collection(db, 'accounts'));
  return snaps.docs.map((d) => {
    const data = d.data() as { participantId?: string; createdAt?: unknown; updatedAt?: unknown };
    return { uid: d.id, participantId: data.participantId ?? '', createdAt: toDate(data.createdAt), updatedAt: toDate(data.updatedAt) };
  });
};

// 管理者が参加者IDを付け替える（本人の端末は次に開いたときにこのIDになる）
export const adminSetParticipantId = async (uid: string, participantId: string) => {
  await setDoc(doc(db, 'accounts', uid), { participantId, updatedAt: serverTimestamp() }, { merge: true });
};

// 管理者用：アカウントのプレイヤー名・フレンド・グループ・学習の記録を別のアカウントへ移す（toUid が null なら消すだけ）
// パスワードの再発行（新しいログインに引き継ぐ）とアカウントの削除で使う。研究データ（ログ）は参加者IDで集計するので触らない
export const moveAccountData = async (fromUid: string, toUid: string | null) => {
  const playerRef = doc(db, 'players', fromUid);
  const [playerSnap, friendsSnap, reqFrom, reqTo, groupsSnap] = await Promise.all([
    getDoc(playerRef),
    getDocs(collection(db, 'players', fromUid, 'friends')),
    getDocs(query(collection(db, 'friendRequests'), where('from', '==', fromUid))),
    getDocs(query(collection(db, 'friendRequests'), where('to', '==', fromUid))),
    getDocs(query(collection(db, 'groups'), where('members', 'array-contains', fromUid)))
  ]);
  const player = playerSnap.exists() ? (playerSnap.data() as Record<string, unknown>) : null;
  const name = typeof player?.name === 'string' ? player.name : '';
  const friendIds = friendsSnap.docs.map((d) => d.id);
  const nameRef = name ? doc(db, 'playerNames', nameKey(name)) : null;
  const nameOwner = nameRef ? await getDoc(nameRef) : null;
  const ownsName = !!nameOwner?.exists() && (nameOwner.data() as { uid?: string }).uid === fromUid;

  const batch = writeBatch(db);
  if (toUid && player && name) {
    const copy: Record<string, unknown> = { name, updatedAt: serverTimestamp() };
    for (const k of ['level', 'title', 'streakDays', 'todayMinutes', 'todayKey']) if (k in player) copy[k] = player[k];
    batch.set(doc(db, 'players', toUid), copy);
    if (nameRef && ownsName) batch.set(nameRef, { uid: toUid, name, updatedAt: serverTimestamp() });
    for (const f of friendIds) {
      if (f === toUid) continue;
      batch.set(doc(db, 'players', toUid, 'friends', f), { addedAt: serverTimestamp() });
      batch.set(doc(db, 'players', f, 'friends', toUid), { addedAt: serverTimestamp() });
    }
  } else if (nameRef && ownsName) {
    batch.delete(nameRef);
  }
  for (const f of friendIds) {
    batch.delete(doc(db, 'players', fromUid, 'friends', f));
    batch.delete(doc(db, 'players', f, 'friends', fromUid));
  }
  [...reqFrom.docs, ...reqTo.docs].forEach((d) => batch.delete(d.ref));
  // グループ：新しいアカウントに入れ替える。消すだけなら外し、リーダーだったら次の人に渡す（誰もいなくなれば消す）
  groupsSnap.docs.forEach((d) => {
    const data = d.data() as { owner?: string; members: string[] };
    const groupRef = doc(db, 'groups', d.id);
    const others = data.members.filter((m) => m !== fromUid && m !== toUid);
    const members = toUid ? [...others, toUid] : others;
    if (members.length === 0) batch.delete(groupRef);
    else batch.set(groupRef, { ...data, members, owner: data.owner === fromUid ? (toUid ?? members[0]) : data.owner });
  });
  if (player) batch.delete(playerRef);
  batch.delete(doc(db, 'accounts', fromUid));
  await batch.commit();
  // 学習の記録（レベル・学習ログなど）
  await moveProgress(fromUid, toUid);
};
