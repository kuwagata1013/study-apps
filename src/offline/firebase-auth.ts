// オフライン版用：firebase/auth の代わり
// - Google ログインの代わりにデモユーザーでログインする
// - 参加者ID＋パスワードのアカウントは、この端末の localStorage にだけ作る
import { readJson, removeKey, writeJson } from './storage';

export interface User {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  email: string | null;
  isAnonymous: boolean;
  providerId: string;
}

type Listener = (user: User | null) => void;

const DEMO_USER: User = {
  uid: 'offline-demo-user',
  displayName: 'デモユーザー',
  photoURL: null,
  email: 'demo@offline.local',
  isAnonymous: false,
  providerId: 'offline'
};

// アプリごとのログイン状態。最初のアプリだけ端末に覚えておく（2つ目のアプリはアカウント作成専用）
class OfflineAuth {
  persist: boolean;
  currentUser: User | null;
  listeners = new Set<Listener>();

  constructor(persist: boolean) {
    this.persist = persist;
    this.currentUser = persist ? readJson<User | null>('user', null) : null;
  }

  setUser(user: User | null) {
    this.currentUser = user;
    if (this.persist) {
      if (user) writeJson('user', user);
      else removeKey('user');
    }
    setTimeout(() => this.emit(), 0);
  }

  emit() {
    const user = this.currentUser ? { ...this.currentUser } : null;
    this.listeners.forEach((fn) => fn(user));
  }
}

const auths = new Map<string, OfflineAuth>();

export type Auth = OfflineAuth;
export const getAuth = (app?: { name?: string }): OfflineAuth => {
  const name = app?.name ?? '[DEFAULT]';
  let a = auths.get(name);
  if (!a) {
    a = new OfflineAuth(name === '[DEFAULT]');
    auths.set(name, a);
  }
  return a;
};

export class GoogleAuthProvider {
  providerId = 'google.com';
  setCustomParameters(_params: Record<string, string>) {
    return this;
  }
  addScope(_scope: string) {
    return this;
  }
}

export const signInWithPopup = async (a: OfflineAuth, _provider?: unknown) => {
  a.setUser(readJson<User | null>('profile', null) ?? { ...DEMO_USER });
  return { user: a.currentUser as User };
};

// ===== メールアドレス＋パスワード（参加者ID＋パスワードのアカウントに使う） =====
type StoredAccount = { uid: string; password: string };
const loadAccounts = () => readJson<Record<string, StoredAccount>>('auth_accounts', {});
const authError = (code: string) => Object.assign(new Error(code), { code });

export const createUserWithEmailAndPassword = async (a: OfflineAuth, email: string, password: string) => {
  const key = email.trim().toLowerCase();
  const accounts = loadAccounts();
  if (accounts[key]) throw authError('auth/email-already-in-use');
  if (password.length < 6) throw authError('auth/weak-password');
  const uid = `offline-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  accounts[key] = { uid, password };
  writeJson('auth_accounts', accounts);
  a.setUser({ uid, displayName: null, photoURL: null, email: key, isAnonymous: false, providerId: 'password' });
  return { user: a.currentUser as User };
};

export const signInWithEmailAndPassword = async (a: OfflineAuth, email: string, password: string) => {
  const key = email.trim().toLowerCase();
  const account = loadAccounts()[key];
  if (!account || account.password !== password) throw authError('auth/invalid-credential');
  a.setUser({ uid: account.uid, displayName: null, photoURL: null, email: key, isAnonymous: false, providerId: 'password' });
  return { user: a.currentUser as User };
};

export const signOut = async (a: OfflineAuth) => {
  a.setUser(null);
};

export const onAuthStateChanged = (a: OfflineAuth, cb: Listener) => {
  a.listeners.add(cb);
  setTimeout(() => cb(a.currentUser ? { ...a.currentUser } : null), 0);
  return () => {
    a.listeners.delete(cb);
  };
};

export const updateProfile = async (user: User, profile: { displayName?: string | null; photoURL?: string | null }) => {
  if (profile.displayName !== undefined) user.displayName = profile.displayName;
  if (profile.photoURL !== undefined) user.photoURL = profile.photoURL;
  const a = getAuth();
  if (a.currentUser && a.currentUser.uid === user.uid) {
    a.currentUser = user;
    writeJson('user', user);
    writeJson('profile', user);
  }
};
