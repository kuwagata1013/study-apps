// オフライン版用：firebase/analytics の代わり（何も送らない）
export const getAnalytics = (_app?: unknown) => ({ offline: true });
export const logEvent = (..._args: unknown[]) => {};
