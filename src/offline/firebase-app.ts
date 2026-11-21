// オフライン版用：firebase/app の代わり（通信しない）
// 名前付きのアプリ（管理者が参加者アカウントを作るときに使う2つ目のアプリ）にも対応する
export type OfflineApp = { name: string; options: Record<string, unknown> };

const apps = new Map<string, OfflineApp>();

export const initializeApp = (options: Record<string, unknown> = {}, name = '[DEFAULT]'): OfflineApp => {
  const app = { name, options };
  apps.set(name, app);
  return app;
};
export const getApps = (): OfflineApp[] => [...apps.values()];
export const getApp = (name = '[DEFAULT]'): OfflineApp => apps.get(name) ?? initializeApp({}, name);
