// オフライン版であることの表示と、デモデータのリセット
import { useState } from 'react';
import { showConfirm } from '../lib/dialog';

export default function OfflineBadge() {
  const [open, setOpen] = useState(false);

  const reset = async () => {
    if (!(await showConfirm('この端末に保存されたデモデータ（ログ・プロフィール・設定など）をすべて消して最初からにしますか？', { okLabel: '最初からにする', danger: true }))) return;
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // 無視
    }
    location.reload();
  };

  return (
    <div className="fixed bottom-36 right-3 md:bottom-4 z-[9999] text-xs font-bold select-none">
      {open && (
        <div className="mb-2 w-60 rounded-xl bg-white text-gray-800 shadow-xl border border-gray-200 p-3 space-y-2 font-normal">
          <p className="font-bold">オフライン版（確認・デモ用）</p>
          <p className="leading-relaxed text-gray-600">
            通信は一切行いません。スタート画面の「生徒として試す」「管理者として試す」でログインなしで確認でき、データはこの端末のブラウザ内だけに保存されます。
          </p>
          <button onClick={reset} className="w-full rounded-lg bg-red-600 text-white py-2 font-bold hover:bg-red-500">
            デモデータをリセット
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="ml-auto block rounded-full bg-amber-500/90 text-white px-3 py-1.5 shadow-lg hover:bg-amber-500"
      >
        オフライン版
      </button>
    </div>
  );
}
