// プロフィール画像のローカル保存ヘルパー
// Firebase Auth の photoURL には長い data URL を保存できないため、
// アップロード画像は縮小してこの端末の localStorage に保存する。

const AVATAR_SIZE = 128;
const keyFor = (uid: string) => `profile_avatar_${uid}`;

export const isDataUrl = (url: string) => url.startsWith('data:');

export const getLocalAvatar = (uid: string): string | null => {
  try {
    return localStorage.getItem(keyFor(uid));
  } catch {
    return null;
  }
};

export const setLocalAvatar = (uid: string, dataUrl: string | null) => {
  try {
    if (dataUrl) localStorage.setItem(keyFor(uid), dataUrl);
    else localStorage.removeItem(keyFor(uid));
  } catch (e) {
    console.error('アイコン画像の保存に失敗しました:', e);
  }
};

// 画像ファイルを正方形に切り抜いて縮小し、JPEG の data URL にする
export const resizeImageFile = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = AVATAR_SIZE;
      canvas.height = AVATAR_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('canvas を利用できません'));
        return;
      }
      ctx.drawImage(
        img,
        (img.width - side) / 2,
        (img.height - side) / 2,
        side,
        side,
        0,
        0,
        AVATAR_SIZE,
        AVATAR_SIZE
      );
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像を読み込めませんでした'));
    };
    img.src = url;
  });
