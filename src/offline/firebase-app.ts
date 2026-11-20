// オフライン版用：firebase/app の代わり（通信しない）
type OfflineApp = { name: string; options: Record<string, unknown> };

let app: OfflineApp | null = null;

export const initializeApp = (options: Record<string, unknown> = {}): OfflineApp => {
  app = { name: '[DEFAULT]', options };
  return app;
};
export const getApps = (): OfflineApp[] => (app ? [app] : []);
export const getApp = (): OfflineApp => app ?? initializeApp();
