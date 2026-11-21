// 参加者ID＋パスワードのアカウント（Google アカウントやメールアドレスがなくても使える）
// - 中身は Firebase の「メール/パスワード」ログイン。メールアドレスの代わりに参加者IDから作った決まった形の文字列を使う
//   （実在しないあて先なので、メールが送られることはない）
// - アカウントは管理者が管理画面でまとめて発行し、参加者ID とパスワードを生徒に配る
// - パスワードはアプリにもデータベースにも保存しない（発行したときに管理者が CSV で受け取るだけ）
// - 発行したIDは台帳（issuedIds）に載せ、載っていないIDは使えないようにする
// - パスワードの再発行は、同じ参加者IDで新しい「世代」のログインを作り直して行う（古いログインは使えなくなる）
import { getApps, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, firebaseConfig } from '../firebase';
import { moveAccountData } from './accounts';

const EMAIL_DOMAIN = 'participants.study-app-f9521.web.app';

// 参加者ID → ログイン用の文字列（大文字・小文字は区別しない）
// 1世代目は以前と同じ形。再発行した2世代目以降は「a01.g2@...」のようになる（参加者IDには「.」は使えないので区別できる）
export const participantEmail = (participantId: string, gen = 1) =>
  `${participantId.trim().toLowerCase()}${gen > 1 ? `.g${gen}` : ''}@${EMAIL_DOMAIN}`;

const localPart = (email: string | null | undefined): string => {
  const e = (email ?? '').toLowerCase();
  const suffix = `@${EMAIL_DOMAIN}`;
  return e.endsWith(suffix) ? e.slice(0, -suffix.length) : '';
};

// 参加者ID＋パスワードのアカウントなら、その参加者ID（小文字）を返す。違えば空文字
export const participantIdFromEmail = (email: string | null | undefined): string => localPart(email).replace(/\.g\d+$/, '');

// ログイン用の文字列から世代を読む（参加者IDのアカウントでなければ 0）
export const generationFromEmail = (email: string | null | undefined): number => {
  const local = localPart(email);
  if (!local) return 0;
  const m = local.match(/\.g(\d+)$/);
  return m ? Number(m[1]) : 1;
};

// ===== 発行済みの参加者ID（issuedIds/{小文字のID}） =====
// ログイン前にも確認するので、1件ずつなら誰でも読める。書けるのは管理者だけ
export interface IssuedId {
  participantId: string;
  gen: number; // 今使えるログインの世代（パスワードを再発行すると増える）
  deleted: boolean; // 管理者が削除した
}

const issuedRef = (participantId: string) => doc(db, 'issuedIds', participantId.trim().toLowerCase());

const toIssued = (fallbackId: string, d: Partial<IssuedId>): IssuedId => ({
  participantId: d.participantId ?? fallbackId,
  gen: Math.max(1, Number(d.gen) || 1),
  deleted: !!d.deleted
});

export const getIssuedId = async (participantId: string): Promise<IssuedId | null> => {
  const snap = await getDoc(issuedRef(participantId));
  return snap.exists() ? toIssued(participantId, snap.data() as Partial<IssuedId>) : null;
};

// 管理者用：台帳のすべて（キーは小文字のID）
export const fetchIssuedIds = async (): Promise<Map<string, IssuedId>> => {
  const snaps = await getDocs(collection(db, 'issuedIds'));
  return new Map(snaps.docs.map((s) => [s.id, toIssued(s.id, s.data() as Partial<IssuedId>)]));
};

const writeIssuedId = (participantId: string, gen: number, deleted: boolean) =>
  setDoc(issuedRef(participantId), { participantId, gen, deleted, updatedAt: serverTimestamp() });

// ログイン中の参加者アカウントが使ってよいか
// - ok: 使える / not_issued: 発行していないID / deleted: 管理者が削除した / replaced: パスワードを再発行したので古いログイン
export type ParticipantLoginState = 'ok' | 'not_issued' | 'deleted' | 'replaced';

export const checkParticipantLogin = async (uid: string, email: string | null | undefined): Promise<ParticipantLoginState> => {
  const pid = participantIdFromEmail(email);
  if (!pid) return 'ok';
  try {
    const issued = await getIssuedId(pid);
    if (issued) {
      if (issued.deleted) return 'deleted';
      return generationFromEmail(email) === issued.gen ? 'ok' : 'replaced';
    }
    // 台帳ができる前に発行したアカウントは、参加者IDがアカウントに登録されていれば使える
    const acc = await getDoc(doc(db, 'accounts', uid));
    const accPid = acc.exists() ? ((acc.data() as { participantId?: string }).participantId ?? '') : '';
    return accPid.toLowerCase() === pid ? 'ok' : 'not_issued';
  } catch (e) {
    // 通信できないときは止めない（オフラインでも使えるように）
    console.error('参加者IDの確認に失敗:', e);
    return 'ok';
  }
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

export type LoginError = 'wrong' | 'deleted' | 'too_many' | 'disabled' | 'network' | 'unknown';

export const loginWithParticipantId = async (participantId: string, password: string): Promise<LoginError | null> => {
  try {
    // 今使える世代を台帳で確認する（台帳にない古いアカウントは1世代目）
    let gen = 1;
    try {
      const issued = await getIssuedId(participantId);
      if (issued?.deleted) return 'deleted';
      if (issued) gen = issued.gen;
    } catch (e) {
      console.error('参加者IDの確認に失敗:', e);
    }
    try {
      sessionStorage.setItem(PENDING_KEY, participantId.trim());
    } catch {
      // 無視
    }
    await signInWithEmailAndPassword(auth, participantEmail(participantId, gen), password);
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

// 新しいログインを作り、台帳と参加者IDの登録まで行う（発行・再発行で共通）
const createParticipantLogin = async (participantId: string, gen: number): Promise<{ uid: string; password: string; message?: string }> => {
  const app = issuerApp();
  const issuerAuth = getAuth(app);
  const password = generatePassword();
  try {
    const cred = await createUserWithEmailAndPassword(issuerAuth, participantEmail(participantId, gen), password);
    // 管理者として台帳に書く（これで、このIDをアカウントに登録できるようになる）
    await writeIssuedId(participantId, gen, false);
    let message: string | undefined;
    try {
      // 作ったアカウント自身として、参加者IDをアカウントに登録する
      await setDoc(doc(getFirestore(app), 'accounts', cred.user.uid), { participantId, createdAt: serverTimestamp() });
    } catch (e) {
      console.error('参加者IDの登録に失敗:', e);
      message = '参加者IDの登録だけ失敗しました（初めてログインしたときに登録されます）';
    }
    return { uid: cred.user.uid, password, message };
  } finally {
    await signOut(issuerAuth).catch(() => undefined);
  }
};

const issueErrorMessage = (e: unknown): string => {
  const code = (e as { code?: string }).code ?? '';
  if (code === 'auth/operation-not-allowed') return 'Firebase コンソールで「メール/パスワード」のログインを有効にしてください';
  if (code === 'auth/too-many-requests') return '短い時間に作りすぎました。しばらく待ってからもう一度お試しください';
  if (code === 'permission-denied') return '書き込めませんでした（新しい Firestore のルールをデプロイしてください）';
  console.error('アカウントの発行に失敗:', e);
  return code || '作成できませんでした';
};

export const issueParticipantAccount = async (participantId: string): Promise<IssueResult> => {
  try {
    const issued = await getIssuedId(participantId);
    if (issued && !issued.deleted) return { participantId, password: '', status: 'exists', message: 'このIDのアカウントはすでにあります' };
    // 削除したIDをもう一度発行するときは、新しい世代で作る
    const r = await createParticipantLogin(participantId, issued ? issued.gen + 1 : 1);
    return { participantId, password: r.password, status: 'created', message: r.message };
  } catch (e) {
    if ((e as { code?: string }).code === 'auth/email-already-in-use') {
      // 台帳ができる前に発行したアカウント：台帳に載せておく
      await writeIssuedId(participantId, 1, false).catch(() => undefined);
      return { participantId, password: '', status: 'exists', message: 'このIDのアカウントはすでにあります' };
    }
    return { participantId, password: '', status: 'error', message: issueErrorMessage(e) };
  }
};

// パスワードを再発行する：同じ参加者IDで新しいログインを作り、プレイヤー名・フレンドを引き継ぐ
// 古いパスワードでログインしている端末は、次に開いたときにログアウトされる
export const resetParticipantPassword = async (oldUid: string, participantId: string): Promise<IssueResult> => {
  try {
    const issued = await getIssuedId(participantId);
    const r = await createParticipantLogin(participantId, (issued?.gen ?? 1) + 1);
    let message = r.message;
    try {
      await moveAccountData(oldUid, r.uid);
    } catch (e) {
      console.error('プレイヤー名・フレンドの引き継ぎに失敗:', e);
      message = 'パスワードは再発行しましたが、プレイヤー名・フレンドの引き継ぎに失敗しました';
    }
    return { participantId, password: r.password, status: 'created', message };
  } catch (e) {
    return { participantId, password: '', status: 'error', message: issueErrorMessage(e) };
  }
};

// アカウントを削除する：このIDではログインできなくなり、プレイヤー名・フレンドも消える（研究データは残る）
export const deleteParticipantAccount = async (uid: string, participantId: string) => {
  const issued = await getIssuedId(participantId);
  await writeIssuedId(participantId, issued?.gen ?? 1, true);
  await moveAccountData(uid, null);
};

// 台帳ができる前に登録されたIDを台帳に載せる（呼ぶ側で管理者の Google アカウントは除く）
export const backfillIssuedIds = async (participantIds: string[], issued: Map<string, IssuedId>) => {
  let added = 0;
  for (const pid of participantIds) {
    const key = pid.toLowerCase();
    if (!pid || issued.has(key)) continue;
    await writeIssuedId(pid, 1, false);
    issued.set(key, { participantId: pid, gen: 1, deleted: false });
    added++;
  }
  return added;
};
