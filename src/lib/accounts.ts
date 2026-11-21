// アカウントに結び付けた研究参加者ID（accounts/{uid}）
// - ログインしている人は、最初に使った参加者IDがアカウントに登録される
// - ほかの端末でもログインすれば同じIDになる。本人は変更できない（変えられるのは管理者だけ）
// - 読めるのは本人と管理者だけ（フレンドなどほかの人には見えない）
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { isValidParticipantId } from './participant';

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
