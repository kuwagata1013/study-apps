// グループ機能
// - groups/{招待コード}: グループ名・リーダー・メンバー。招待コードを知っている人だけが開けて、参加できる
// 参加・退出は本人（管理者は誰でも加えたり外したりできる）、名前の変更・メンバーを外す・解散はリーダーだけ（firestore.rules で確かめている）
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { db } from '../firebase';
import { fetchPlayer, type PlayerProfile } from './players';

export const MAX_GROUP_MEMBERS = 20;
export const MAX_GROUPS = 10; // 1人が入れるグループの数
export const MAX_GROUP_NAME = 20;

export interface Group {
  code: string;
  name: string;
  owner: string;
  members: string[];
}

export const normalizeGroupName = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, MAX_GROUP_NAME);

// 招待コード：見まちがえやすい 0・O・1・I は使わない
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(CODE_LENGTH)), (n) => CODE_CHARS[n % CODE_CHARS.length]).join('');
// 全角や小文字、空白・ハイフンが入っていても読めるようにする
export const normalizeCode = (text: string) => text.normalize('NFKC').toUpperCase().replace(/[\s-]/g, '');
const isValidCode = (code: string) => /^[A-HJ-NP-Z2-9]{8}$/.test(code);

const ref = (code: string) => doc(db, 'groups', code);
const toGroup = (code: string, data: unknown): Group => {
  const d = data as Partial<Group>;
  return { code, name: d.name || 'グループ', owner: d.owner ?? '', members: Array.isArray(d.members) ? d.members : [] };
};

export const fetchMyGroups = async (uid: string): Promise<Group[]> => {
  const snaps = await getDocs(query(collection(db, 'groups'), where('members', 'array-contains', uid)));
  return snaps.docs.map((d) => toGroup(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
};

export const fetchMembers = async (g: Group): Promise<PlayerProfile[]> =>
  (await Promise.all(g.members.map((id) => fetchPlayer(id).catch(() => null)))).filter((p): p is PlayerProfile => p !== null);

export const createGroup = async (uid: string, name: string): Promise<string> => {
  const code = newCode();
  await setDoc(ref(code), { name: normalizeGroupName(name), owner: uid, members: [uid], createdAt: serverTimestamp() });
  return code;
};

export type JoinResult = { status: 'joined'; group: Group } | { status: 'not_found' | 'already' | 'full' };

export const joinGroup = async (uid: string, text: string): Promise<JoinResult> => {
  const code = normalizeCode(text);
  if (!isValidCode(code)) return { status: 'not_found' };
  const snap = await getDoc(ref(code));
  if (!snap.exists()) return { status: 'not_found' };
  const group = toGroup(code, snap.data());
  if (group.members.includes(uid)) return { status: 'already' };
  if (group.members.length >= MAX_GROUP_MEMBERS) return { status: 'full' };
  await updateDoc(ref(code), { members: arrayUnion(uid) });
  return { status: 'joined', group };
};

export const renameGroup = async (code: string, name: string) => {
  await updateDoc(ref(code), { name: normalizeGroupName(name) });
};

// リーダーがメンバーを外す
export const removeMember = async (code: string, memberId: string) => {
  await updateDoc(ref(code), { members: arrayRemove(memberId) });
};

// 退出する。リーダーなら次の人にリーダーを渡す（ほかに誰もいなければグループを消す）
export const leaveGroup = async (uid: string, code: string) => {
  const snap = await getDoc(ref(code));
  if (!snap.exists()) return;
  const g = toGroup(code, snap.data());
  if (g.owner !== uid) {
    await updateDoc(ref(code), { members: arrayRemove(uid) });
    return;
  }
  const next = g.members.find((m) => m !== uid);
  if (next) await updateDoc(ref(code), { owner: next, members: arrayRemove(uid) });
  else await deleteDoc(ref(code));
};

// 管理者用：すべてのグループ
export const fetchAllGroups = async (): Promise<Group[]> => {
  const snaps = await getDocs(collection(db, 'groups'));
  return snaps.docs.map((d) => toGroup(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
};

// 管理者用：本人の操作なしでメンバーに加える
export const adminAddMembers = async (code: string, uids: string[]) => {
  await updateDoc(ref(code), { members: arrayUnion(...uids) });
};

export const dissolveGroup = async (code: string) => {
  await deleteDoc(ref(code));
};
