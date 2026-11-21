// 参加者ID＋パスワードのアカウント（Google アカウントやメールアドレスがなくても使える）
// - 中身は Firebase の「メール/パスワード」ログイン。メールアドレスの代わりに参加者IDから作った決まった形の文字列を使う
//   （実在しないあて先なので、メールが送られることはない）
// - アカウントは管理者が管理画面でまとめて発行し、参加者ID とパスワードを生徒に配る
// - パスワードはアプリにもデータベースにも保存しない（発行したときに管理者が CSV で受け取るだけ）
import { getApps, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, firebaseConfig } from '../firebase';

const EMAIL_DOMAIN = 'participants.study-app-f9521.web.app';

// 参加者ID → ログイン用の文字列（大文字・小文字は区別しない）
export const participantEmail = (participantId: string) => `${participantId.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

// 参加者ID＋パスワードのアカウントなら、その参加者ID（小文字）を返す。違えば空文字
export const participantIdFromEmail = (email: string | null | undefined): string => {
  const e = (email ?? '').toLowerCase();
  const suffix = `@${EMAIL_DOMAIN}`;
  return e.endsWith(suffix) ? e.slice(0, -suffix.length) : '';
};

// ===== ログイン =====
// ログインしたときに入力した参加者ID（大文字・小文字をそのまま残すため。アカウントへの登録に使う）
const PENDING_KEY = 'participant_login_id';
export const takePendingLoginId = (): string => {
  try {
    const v = sessionStorage.getItem(PENDING_KEY) || '';
    sessionStorage.removeItem(PENDING_KEY);
    return v;
  } catch {
    return '';
  }
};

export type LoginError = 'wrong' | 'too_many' | 'disabled' | 'network' | 'unknown';

export const loginWithParticipantId = async (participantId: string, password: string): Promise<LoginError | null> => {
  try {
    try {
      sessionStorage.setItem(PENDING_KEY, participantId.trim());
    } catch {
      // 無視
    }
    await signInWithEmailAndPassword(auth, participantEmail(participantId), password);
    return null;
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    console.error('参加者IDでのログインに失敗:', code || e);
    if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(code)) return 'wrong';
    if (code === 'auth/too-many-requests') return 'too_many';
    if (code === 'auth/operation-not-allowed' || code === 'auth/user-disabled') return 'disabled';
    if (code === 'auth/network-request-failed') return 'network';
    return 'unknown';
  }
};

// ===== 管理者がアカウントを発行する =====
// 読み間違えやすい文字（0/o、1/l/i など）を除いたパスワード
const PASSWORD_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
export const generatePassword = (length = 8) => {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PASSWORD_CHARS[b % PASSWORD_CHARS.length]).join('');
};

// 「A01~A30」のような範囲と、1行に1つずつ書いた参加者IDを読み取る
export const parseParticipantIds = (text: string): string[] => {
  const out: string[] = [];
  for (const raw of text.split(/[\n,、\s]+/)) {
    const item = raw.trim();
    if (!item) continue;
    const m = item.match(/^([A-Za-z_-]*?)(\d+)[~〜～]\1?(\d+)$/);
    if (m) {
      const [, prefix, from, to] = m;
      const width = from.length;
      const a = Number(from);
      const b = Number(to);
      if (b >= a && b - a < 500) {
        for (let n = a; n <= b; n++) out.push(prefix + String(n).padStart(width, '0'));
        continue;
      }
    }
    out.push(item);
  }
  // 同じIDは1回だけ（大文字・小文字は同じとみなす）
  const seen = new Set<string>();
  return out.filter((id) => {
    const k = id.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

export interface IssueResult {
  participantId: string;
  password: string;
  status: 'created' | 'exists' | 'error';
  message?: string;
}

// アカウントを作るための2つ目のアプリ（管理者のログインはそのままにしておくため）
const issuerApp = () => getApps().find((a) => a.name === 'participant-issuer') ?? initializeApp(firebaseConfig, 'participant-issuer');

export const issueParticipantAccount = async (participantId: string): Promise<IssueResult> => {
  const app = issuerApp();
  const issuerAuth = getAuth(app);
  const password = generatePassword();
  try {
    const cred = await createUserWithEmailAndPassword(issuerAuth, participantEmail(participantId), password);
    let message: string | undefined;
    try {
      // 作ったアカウント自身として、参加者IDをアカウントに登録する
      await setDoc(doc(getFirestore(app), 'accounts', cred.user.uid), { participantId, createdAt: serverTimestamp() });
    } catch (e) {
      console.error('参加者IDの登録に失敗:', e);
      message = '参加者IDの登録だけ失敗しました（初めてログインしたときに登録されます）';
    }
    await signOut(issuerAuth).catch(() => undefined);
    return { participantId, password, status: 'created', message };
  } catch (e) {
    await signOut(issuerAuth).catch(() => undefined);
    const code = (e as { code?: string }).code ?? '';
    if (code === 'auth/email-already-in-use') return { participantId, password: '', status: 'exists', message: 'このIDのアカウントはすでにあります' };
    if (code === 'auth/operation-not-allowed')
      return {
        participantId,
        password: '',
        status: 'error',
        message: 'Firebase コンソールで「メール/パスワード」のログインを有効にしてください'
      };
    if (code === 'auth/too-many-requests')
      return { participantId, password: '', status: 'error', message: '短い時間に作りすぎました。しばらく待ってからもう一度お試しください' };
    console.error('アカウントの発行に失敗:', e);
    return { participantId, password: '', status: 'error', message: code || '作成できませんでした' };
  }
};
