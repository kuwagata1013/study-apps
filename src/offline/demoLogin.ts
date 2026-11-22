// オフライン版だけ：ワンタップでログインして確認できるようにする
// - 生徒：参加者ID「DEMO01」のアカウントを（なければ発行して）ログインする。名前は「デモ生徒」
// - 管理者：Google ログインの代わりのデモユーザー（オフライン版では管理者として扱う）
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../firebase';
import { issueParticipantAccount, loginWithParticipantId, participantEmail } from '../lib/participantAuth';
import { claimPlayerName } from '../lib/players';
import { readJson } from './storage';

export const DEMO_STUDENT_ID = 'DEMO01';
const DEMO_STUDENT_NAME = 'デモ生徒';

type StoredAccount = { uid: string; password: string };
const findAccount = (): StoredAccount | undefined =>
  readJson<Record<string, StoredAccount>>('auth_accounts', {})[participantEmail(DEMO_STUDENT_ID).trim().toLowerCase()];

// うまくいけば null、だめならエラーの文
export const loginAsDemoStudent = async (): Promise<string | null> => {
  let account = findAccount();
  if (!account) {
    const r = await issueParticipantAccount(DEMO_STUDENT_ID);
    account = findAccount();
    if (!account) return r.message ?? 'デモ用アカウントを作れませんでした';
    await claimPlayerName(account.uid, DEMO_STUDENT_NAME).catch(() => undefined);
  }
  const err = await loginWithParticipantId(DEMO_STUDENT_ID, account.password);
  return err ? 'デモ用アカウントでログインできませんでした。「オフライン版」→「デモデータをリセット」を試してください' : null;
};

export const loginAsDemoAdmin = async () => {
  await signInWithPopup(auth, new GoogleAuthProvider());
};
