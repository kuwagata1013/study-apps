// オフライン版用：firebase/auth の代わり。Google ログインの代わりにデモユーザーでログインする
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

class OfflineAuth {
  currentUser: User | null = readJson<User | null>('user', null);
  listeners = new Set<Listener>();

  emit() {
    const user = this.currentUser ? { ...this.currentUser } : null;
    this.listeners.forEach((fn) => fn(user));
  }
}

const auth = new OfflineAuth();

export type Auth = OfflineAuth;
export const getAuth = (_app?: unknown): OfflineAuth => auth;

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
  a.currentUser = readJson<User | null>('profile', null) ?? { ...DEMO_USER };
  writeJson('user', a.currentUser);
  setTimeout(() => a.emit(), 0);
  return { user: a.currentUser };
};

export const signOut = async (a: OfflineAuth) => {
  a.currentUser = null;
  removeKey('user');
  setTimeout(() => a.emit(), 0);
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
  if (auth.currentUser && auth.currentUser.uid === user.uid) {
    auth.currentUser = user;
    writeJson('user', user);
    writeJson('profile', user);
  }
};
