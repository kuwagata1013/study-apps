// お問い合わせ（シンプル版・ゲーム版から送り、管理画面で見る）
// - inquiries/{自動ID}: 送った人・種類・内容・対応状況。送れるのはログインした本人だけ、読めるのは管理者だけ
import { collection, deleteDoc, doc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getParticipantId } from './participant';
import { getDeviceId } from './researchLog';
import { getCachedName } from './players';

export const INQUIRY_CATEGORIES = {
  bug: '不具合',
  usage: '使い方',
  request: '要望',
  other: 'その他'
} as const;
export type InquiryCategory = keyof typeof INQUIRY_CATEGORIES;
export const MAX_INQUIRY_LENGTH = 2000;

export interface Inquiry {
  id: string;
  uid: string;
  participantId: string;
  playerName: string;
  mode: 'simple' | 'gamified';
  category: InquiryCategory;
  message: string;
  status: 'open' | 'done';
  adminMemo: string;
  userAgent: string;
  createdAt: Date | null;
}

export const sendInquiry = async (input: { uid: string; mode: 'simple' | 'gamified'; category: InquiryCategory; message: string }) => {
  await addDoc(collection(db, 'inquiries'), {
    uid: input.uid,
    participantId: getParticipantId(),
    playerName: getCachedName(input.uid).slice(0, 20),
    deviceId: getDeviceId(),
    mode: input.mode,
    category: input.category,
    message: input.message.trim().slice(0, MAX_INQUIRY_LENGTH),
    status: 'open',
    userAgent: navigator.userAgent.slice(0, 512),
    createdAt: serverTimestamp()
  });
};

// ===== 管理者用 =====
const toDate = (v: unknown): Date | null =>
  v && typeof (v as { toDate?: unknown }).toDate === 'function' ? (v as { toDate: () => Date }).toDate() : null;

export const fetchInquiries = async (): Promise<Inquiry[]> => {
  const snaps = await getDocs(query(collection(db, 'inquiries'), orderBy('createdAt', 'desc'), limit(500)));
  return snaps.docs.map((d) => {
    const v = d.data() as Record<string, unknown>;
    const str = (k: string) => (typeof v[k] === 'string' ? (v[k] as string) : '');
    return {
      id: d.id,
      uid: str('uid'),
      participantId: str('participantId'),
      playerName: str('playerName'),
      mode: v.mode === 'gamified' ? 'gamified' : 'simple',
      category: (str('category') in INQUIRY_CATEGORIES ? str('category') : 'other') as InquiryCategory,
      message: str('message'),
      status: v.status === 'done' ? 'done' : 'open',
      adminMemo: str('adminMemo'),
      userAgent: str('userAgent'),
      createdAt: toDate(v.createdAt)
    };
  });
};

export const updateInquiry = async (id: string, change: { status?: 'open' | 'done'; adminMemo?: string }) => {
  await setDoc(doc(db, 'inquiries', id), { ...change, updatedAt: serverTimestamp() }, { merge: true });
};

export const deleteInquiry = async (id: string) => {
  await deleteDoc(doc(db, 'inquiries', id));
};
