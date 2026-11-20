// オフライン版のデータはすべてこの端末の localStorage に保存する
export const OFFLINE_PREFIX = 'offline_demo_';

export const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(OFFLINE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

export const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(OFFLINE_PREFIX + key, JSON.stringify(value));
  } catch {
    // 容量オーバーなどは無視（デモ用）
  }
};

export const removeKey = (key: string) => {
  try {
    localStorage.removeItem(OFFLINE_PREFIX + key);
  } catch {
    // 無視
  }
};
