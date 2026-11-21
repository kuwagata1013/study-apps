// 管理者用：管理者アカウント（Google でログインした研究者）の一覧
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Shield } from 'lucide-react';
import { auth } from '../../firebase';
import { fetchAdminAccounts, type AdminAccount } from '../../lib/admins';

const dateText = (d: Date | null) =>
  d ? `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';

export const AdminAccountsPanel: React.FC = () => {
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const myUid = auth.currentUser?.uid ?? '';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setAdmins(await fetchAdminAccounts());
    } catch (e) {
      console.error('管理者一覧の読み込みに失敗:', e);
      setError('管理者の一覧を読み込めませんでした');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="bg-black rounded-3xl p-6 border border-purple-900/60 space-y-3 shadow-xl">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Shield size={18} className="text-purple-400" /> 管理者アカウント（{admins.length}件）
        </h2>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="p-2 rounded-xl text-purple-300 hover:bg-purple-500/10 disabled:opacity-40"
          aria-label="更新"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      <p className="text-[11px] text-neutral-400 leading-relaxed">
        Google でログインする管理者です。研究データの集計では、ここにあるアカウントの記録を除けます。
        メールアドレスは、その管理者が一度この管理画面を開くと表示されます。
      </p>
      {error && <p className="text-[11px] font-bold text-red-400">{error}</p>}
      <div className="space-y-2">
        {admins.map((a) => (
          <div key={a.uid} className="p-3 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">
                {a.email || <span className="text-neutral-500">（メールアドレス未登録）</span>}
                {a.uid === myUid && <span className="ml-2 text-[10px] text-purple-300">あなた</span>}
              </p>
              <p className="text-[10px] text-neutral-500 font-mono truncate select-all">{a.uid}</p>
            </div>
            <div className="shrink-0 text-right text-[10px] text-neutral-400">
              {a.name && <p className="text-neutral-200">{a.name}</p>}
              {a.lastSeenAt && <p>最終 {dateText(a.lastSeenAt)}</p>}
            </div>
          </div>
        ))}
        {!loading && admins.length === 0 && !error && <p className="text-[11px] text-neutral-500">管理者は見つかりませんでした</p>}
      </div>
    </div>
  );
};

export default AdminAccountsPanel;
