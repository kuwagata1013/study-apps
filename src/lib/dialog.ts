// アプリ内のポップアップ（ブラウザ標準の alert / confirm / prompt の代わり）
// どこからでも呼べる。画面には components/DialogHost が1つずつ順番に出す
export type DialogTheme = 'light' | 'game' | 'admin';
export type DialogIcon = 'gift' | 'gem' | 'flame' | 'trophy' | 'level' | 'record';

export interface AlertOptions {
  title?: string;
  message?: string;
  icon?: DialogIcon;
  rows?: { label: string; value: string }[]; // 内訳
  total?: { label: string; value: string }; // 内訳の合計
  onShow?: () => void; // 画面に出たとき（紙ふぶきなど）
}
export interface ConfirmOptions {
  okLabel?: string;
  danger?: boolean; // 消す・元に戻せない操作
}
export interface DialogEntry extends AlertOptions, ConfirmOptions {
  id: number;
  kind: 'alert' | 'confirm' | 'prompt';
  defaultValue?: string;
  resolve: (value: string | null) => void; // OK は文字列、キャンセルは null
}

let nextId = 1;
let state: { queue: DialogEntry[]; theme: DialogTheme } = { queue: [], theme: 'light' };
const listeners = new Set<() => void>();
const setState = (next: Partial<typeof state>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};

export const subscribeDialogs = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getDialogState = () => state;
export const setDialogTheme = (theme: DialogTheme) => setState({ theme });

export const closeDialog = (id: number, value: string | null) => {
  const entry = state.queue.find((d) => d.id === id);
  if (!entry) return;
  setState({ queue: state.queue.filter((d) => d.id !== id) });
  entry.resolve(value);
};

const open = (entry: Omit<DialogEntry, 'id' | 'resolve'>) =>
  new Promise<string | null>((resolve) => {
    setState({ queue: [...state.queue, { ...entry, id: nextId++, resolve }] });
  });

export const showAlert = async (options: string | AlertOptions): Promise<void> => {
  await open({ ...(typeof options === 'string' ? { message: options } : options), kind: 'alert' });
};
export const showConfirm = async (message: string, options: ConfirmOptions = {}): Promise<boolean> =>
  (await open({ ...options, message, kind: 'confirm' })) !== null;
export const showPrompt = (message: string, defaultValue = ''): Promise<string | null> =>
  open({ message, defaultValue, kind: 'prompt' });
