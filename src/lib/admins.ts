// 管理者アカウント（Google でログインした研究者）
// - admins/{uid}: 管理者の印（Firebase コンソールで追加する）
// - adminProfiles/{uid}: 管理者が管理画面を開いたときに、自分のメールアドレスを残す（管理者どうしで誰かわかるように）
//   読めるのは管理者だけ。生徒のメールアドレスは保存しない
import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { fetchPlayer } from './players';

export interface AdminAccount {
  uid: string;
  email: string;
  name: string;
  lastSeenAt: Date | null;
}

const toDate = (v: unknown): Date | null =>
  v && typeof (v as { toDate?: unknown }).toDate === 'function' ? (v as { toDate: () => Date }).toDate() : null;

// 管理画面を開いたときに呼ぶ
export const recordAdminProfile = async (uid: string, email: string | null | undefined) => {
  await setDoc(doc(db, 'adminProfiles', uid), { email: (email ?? '').slice(0, 200), lastSeenAt: serverTimestamp() });
};

// 管理者のアカウントID（集計から除くときに使う）
export const fetchAdminUids = async (): Promise<string[]> => (await getDocs(collection(db, 'admins'))).docs.map((d) => d.id);

export const fetchAdminAccounts = async (): Promise<AdminAccount[]> => {
  const [uids, profiles] = await Promise.all([fetchAdminUids(), getDocs(collection(db, 'adminProfiles'))]);
  const byUid = new Map(profiles.docs.map((d) => [d.id, d.data() as { email?: string; lastSeenAt?: unknown }]));
  const names = await Promise.all(uids.map((uid) => fetchPlayer(uid).catch(() => null)));
  return uids.map((uid, i) => ({
    uid,
    email: byUid.get(uid)?.email ?? '',
    name: names[i]?.name ?? '',
    lastSeenAt: toDate(byUid.get(uid)?.lastSeenAt)
  }));
};
