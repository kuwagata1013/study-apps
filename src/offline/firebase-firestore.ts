// オフライン版用：firebase/firestore の代わり。コレクションを localStorage に保存する
import { readJson, writeJson } from './storage';

export class Timestamp {
  seconds: number;
  nanoseconds: number;

  constructor(seconds: number, nanoseconds: number) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }
  static fromMillis(ms: number) {
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6);
  }
  static fromDate(d: Date) {
    return Timestamp.fromMillis(d.getTime());
  }
  static now() {
    return Timestamp.fromMillis(Date.now());
  }
  toMillis() {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
  }
  toDate() {
    return new Date(this.toMillis());
  }
}

const SERVER_TS = { __offlineServerTimestamp: true };
export const serverTimestamp = () => SERVER_TS;

export const getFirestore = (_app?: unknown) => ({ offline: true });
type Db = ReturnType<typeof getFirestore>;

// 保存形式：Timestamp は { __ts: ミリ秒 } に変換
const encode = (v: unknown): unknown => {
  if (v === SERVER_TS) return { __ts: Date.now() };
  if (v instanceof Timestamp) return { __ts: v.toMillis() };
  if (v instanceof Date) return { __ts: v.getTime() };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]));
  return v;
};
const decode = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.__ts === 'number' && Object.keys(o).length === 1) return Timestamp.fromMillis(o.__ts);
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, decode(x)]));
  }
  return v;
};

type Stored = Record<string, Record<string, unknown>>;
// 配列に足す・配列から除く（updateDoc で使う）
interface ArrayOp {
  __arrayOp: 'union' | 'remove';
  values: unknown[];
}
export const arrayUnion = (...values: unknown[]): ArrayOp => ({ __arrayOp: 'union', values });
export const arrayRemove = (...values: unknown[]): ArrayOp => ({ __arrayOp: 'remove', values });
const isArrayOp = (v: unknown): v is ArrayOp => !!v && typeof v === 'object' && '__arrayOp' in v;

const load = (path: string): Stored => readJson<Stored>('col_' + path, {});
const save = (path: string, docs: Stored) => writeJson('col_' + path, docs);

export interface CollectionReference {
  type: 'collection';
  path: string;
}
export interface DocumentReference {
  type: 'document';
  path: string;
  id: string;
  parent: string;
}

export const collection = (_db: Db, path: string, ...rest: string[]): CollectionReference => ({
  type: 'collection',
  path: [path, ...rest].join('/')
});

export function doc(_db: Db, path: string, ...rest: string[]): DocumentReference {
  const parts = [path, ...rest].join('/').split('/');
  const id = parts.pop() as string;
  return { type: 'document', path: [...parts, id].join('/'), id, parent: parts.join('/') };
}

// 管理者判定：オフライン版ではデモユーザーを常に管理者として扱う
const builtIn = (ref: DocumentReference): Record<string, unknown> | undefined =>
  ref.parent === 'admins' ? { role: 'admin', offline: true } : undefined;

const makeSnap = (id: string, data: Record<string, unknown> | undefined) => ({
  id,
  exists: () => data !== undefined,
  data: () => (data === undefined ? undefined : (decode(data) as Record<string, unknown>))
});

export const getDoc = async (ref: DocumentReference) => {
  const stored = load(ref.parent)[ref.id];
  return makeSnap(ref.id, stored ?? builtIn(ref));
};

// merge: true のときは、入れ子のオブジェクトも含めて既存の内容に重ねる（本物の Firestore と同じ）
const isPlain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v) && !(typeof (v as { __ts?: unknown }).__ts === 'number');
const deepMerge = (base: Record<string, unknown>, add: Record<string, unknown>): Record<string, unknown> => {
  const out = { ...base };
  for (const [k, v] of Object.entries(add)) {
    out[k] = isPlain(v) && isPlain(out[k]) ? deepMerge(out[k] as Record<string, unknown>, v) : v;
  }
  return out;
};

export const setDoc = async (ref: DocumentReference, data: Record<string, unknown>, options?: { merge?: boolean }) => {
  const docs = load(ref.parent);
  const encoded = encode(data) as Record<string, unknown>;
  docs[ref.id] = options?.merge && docs[ref.id] ? deepMerge(docs[ref.id], encoded) : encoded;
  save(ref.parent, docs);
};

export const updateDoc = async (ref: DocumentReference, data: Record<string, unknown>) => {
  const docs = load(ref.parent);
  const old = docs[ref.id];
  if (!old) throw new Error('not-found');
  const next = { ...old };
  for (const [k, v] of Object.entries(data)) {
    if (isArrayOp(v)) {
      const rest = (Array.isArray(old[k]) ? (old[k] as unknown[]) : []).filter((x) => !v.values.includes(x));
      next[k] = v.__arrayOp === 'union' ? [...rest, ...v.values] : rest;
    } else next[k] = encode(v);
  }
  docs[ref.id] = next;
  save(ref.parent, docs);
};

export const addDoc = async (ref: CollectionReference, data: Record<string, unknown>) => {
  const docs = load(ref.path);
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  docs[id] = encode(data) as Record<string, unknown>;
  save(ref.path, docs);
  return { id, path: `${ref.path}/${id}` };
};

export const deleteDoc = async (ref: DocumentReference) => {
  const docs = load(ref.parent);
  delete docs[ref.id];
  save(ref.parent, docs);
};

// まとめて書き込む（オフライン版では順に書くだけ）
export const writeBatch = (_db: Db) => {
  const ops: (() => Promise<void>)[] = [];
  const batch = {
    set: (ref: DocumentReference, data: Record<string, unknown>, options?: { merge?: boolean }) => {
      ops.push(() => setDoc(ref, data, options));
      return batch;
    },
    delete: (ref: DocumentReference) => {
      ops.push(() => deleteDoc(ref));
      return batch;
    },
    commit: async () => {
      for (const op of ops) await op();
    }
  };
  return batch;
};

type Constraint =
  | { kind: 'orderBy'; field: string; dir: 'asc' | 'desc' }
  | { kind: 'limit'; n: number }
  | { kind: 'where'; field: string; op: WhereOp; value: unknown };
type WhereOp = '==' | 'array-contains';
// where は「==」と「array-contains」だけに対応
export const where = (field: string, op: WhereOp, value: unknown): Constraint => ({ kind: 'where', field, op, value });
export const orderBy = (field: string, dir: 'asc' | 'desc' = 'asc'): Constraint => ({ kind: 'orderBy', field, dir });
export const limit = (n: number): Constraint => ({ kind: 'limit', n });

export interface Query {
  type: 'query';
  path: string;
  constraints: Constraint[];
}
export const query = (ref: CollectionReference | Query, ...constraints: Constraint[]): Query => ({
  type: 'query',
  path: ref.path,
  constraints: [...(ref.type === 'query' ? ref.constraints : []), ...constraints]
});

const sortKey = (v: unknown): number | string => {
  if (v && typeof v === 'object' && typeof (v as { __ts?: unknown }).__ts === 'number') return (v as { __ts: number }).__ts;
  if (typeof v === 'number' || typeof v === 'string') return v;
  return '';
};

export const getDocs = async (ref: CollectionReference | Query) => {
  let entries = Object.entries(load(ref.path));
  const constraints = ref.type === 'query' ? ref.constraints : [];
  for (const c of constraints) {
    if (c.kind !== 'where') continue;
    entries = entries.filter(([, d]) => {
      const v = d[c.field];
      return c.op === '==' ? v === c.value : Array.isArray(v) && v.includes(c.value);
    });
  }
  for (const c of [...constraints].reverse()) {
    if (c.kind !== 'orderBy') continue;
    entries = [...entries].sort((a, b) => {
      const x = sortKey(a[1][c.field]);
      const y = sortKey(b[1][c.field]);
      const r = x < y ? -1 : x > y ? 1 : 0;
      return c.dir === 'desc' ? -r : r;
    });
  }
  const lim = constraints.find((c) => c.kind === 'limit');
  if (lim && lim.kind === 'limit') entries = entries.slice(0, lim.n);
  const docs = entries.map(([id, data]) => makeSnap(id, data));
  return { docs, size: docs.length, empty: docs.length === 0, forEach: (fn: (d: (typeof docs)[number]) => void) => docs.forEach(fn) };
};
