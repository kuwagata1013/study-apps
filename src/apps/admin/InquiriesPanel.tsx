// 管理者用：お問い合わせの一覧（未対応・対応済みの切り替え、メモ、削除）
import React, { useCallback, useEffect, useState } from 'react';
import { Check, Inbox, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { deleteInquiry, fetchInquiries, INQUIRY_CATEGORIES, updateInquiry, type Inquiry } from '../../lib/inquiries';
import { showConfirm, showPrompt } from '../../lib/dialog';

const dateText = (d: Date | null) =>
  d ? `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';

const CATEGORY_COLOR: Record<string, string> = {
  bug: 'bg-red-500/15 text-red-300 border-red-500/30',
  usage: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  request: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  other: 'bg-neutral-700/40 text-neutral-300 border-neutral-600'
};

// onOpenCount: 未対応の件数（タブの印に使う）
export const InquiriesPanel: React.FC<{ onOpenCount?: (n: number) => void }> = ({ onOpenCount }) => {
  const [items, setItems] = useState<Inquiry[]>([]);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await fetchInquiries());
    } catch (e) {
      console.error('お問い合わせの読み込みに失敗:', e);
      setError('読み込めませんでした。管理者アカウントでログインしているか、通信状態を確認してください');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCount = items.filter((x) => x.status === 'open').length;
  useEffect(() => {
    if (!loading) onOpenCount?.(openCount);
  }, [openCount, loading, onOpenCount]);

  const act = async (id: string, action: () => Promise<void>, apply: (list: Inquiry[]) => Inquiry[]) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await action();
      setItems(apply);
    } catch (e) {
      console.error('お問い合わせの更新に失敗:', e);
      setError('更新できませんでした（新しい Firestore のルールがデプロイされているか確認してください）');
    } finally {
      setBusyId('');
    }
  };

  const toggle = (x: Inquiry) => {
    const status = x.status === 'open' ? 'done' : 'open';
    void act(x.id, () => updateInquiry(x.id, { status }), (list) => list.map((y) => (y.id === x.id ? { ...y, status } : y)));
  };
  const editMemo = async (x: Inquiry) => {
    const memo = await showPrompt('対応メモ（管理者だけが見られます）', x.adminMemo);
    if (memo === null) return;
    const adminMemo = memo.trim().slice(0, 1000);
    void act(x.id, () => updateInquiry(x.id, { adminMemo }), (list) => list.map((y) => (y.id === x.id ? { ...y, adminMemo } : y)));
  };
  const remove = async (x: Inquiry) => {
    if (!(await showConfirm('このお問い合わせを削除しますか？元に戻せません。', { okLabel: '削除する', danger: true }))) return;
    void act(x.id, () => deleteInquiry(x.id), (list) => list.filter((y) => y.id !== x.id));
  };

  const shown = filter === 'open' ? items.filter((x) => x.status === 'open') : items;

  return (
    <div className="bg-black rounded-3xl p-6 border border-neutral-800 space-y-4 shadow-xl">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Inbox size={18} className="text-sky-400" /> お問い合わせ
        </h2>
        <button onClick={() => void load()} disabled={loading} className="p-2 rounded-xl text-sky-400 hover:bg-sky-500/10 disabled:opacity-40" aria-label="更新">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      <p className="text-[11px] text-neutral-400 leading-relaxed">生徒がシンプル版・ゲーム版の設定（プロフィール）画面から送ったお問い合わせです。返信の機能はないので、必要なら直接伝えてください。</p>

      <div className="flex gap-1 p-1 rounded-xl bg-neutral-900 border border-neutral-800 w-fit">
        {(
          [
            ['open', `未対応（${openCount}）`],
            ['all', `すべて（${items.length}）`]
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            aria-pressed={filter === id}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${filter === id ? 'bg-sky-600 text-white' : 'text-neutral-400 hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-[11px] font-bold text-red-400">{error}</p>}
      {shown.length === 0 && (
        <p className="py-6 text-center text-xs text-neutral-500">
          {loading ? '読み込み中...' : filter === 'open' ? '未対応のお問い合わせはありません' : 'お問い合わせはまだありません'}
        </p>
      )}

      <div className="space-y-3">
        {shown.map((x) => (
          <div key={x.id} className={`p-4 rounded-2xl border space-y-2 ${x.status === 'open' ? 'bg-neutral-900 border-sky-900/70' : 'bg-neutral-950 border-neutral-800 opacity-75'}`}>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className={`px-2 py-0.5 rounded-full border font-bold ${CATEGORY_COLOR[x.category]}`}>{INQUIRY_CATEGORIES[x.category]}</span>
              <span className="font-bold text-white">{x.playerName || '（名前未設定）'}</span>
              <span className="font-mono text-neutral-400">{x.participantId || '参加者IDなし'}</span>
              <span className="text-neutral-500">{x.mode === 'gamified' ? 'ゲーム版' : 'シンプル版'}</span>
              <span className="ml-auto text-neutral-500">{dateText(x.createdAt)}</span>
            </div>
            <p className="text-sm text-neutral-100 whitespace-pre-wrap break-words">{x.message}</p>
            {x.adminMemo && <p className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 whitespace-pre-wrap">メモ：{x.adminMemo}</p>}
            <p className="text-[10px] text-neutral-600 break-all">{x.userAgent}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={() => toggle(x)}
                disabled={!!busyId}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold disabled:opacity-40 ${
                  x.status === 'open' ? 'bg-sky-600 hover:bg-sky-500 text-white' : 'border border-neutral-700 text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                {x.status === 'open' ? <Check size={12} /> : <RotateCcw size={12} />}
                {x.status === 'open' ? '対応済みにする' : '未対応に戻す'}
              </button>
              <button onClick={() => void editMemo(x)} disabled={!!busyId} className="px-3 py-1.5 rounded-lg border border-neutral-700 text-neutral-300 text-[11px] font-bold hover:bg-neutral-800 disabled:opacity-40">
                {x.adminMemo ? 'メモを直す' : 'メモを書く'}
              </button>
              <button
                onClick={() => void remove(x)}
                disabled={!!busyId}
                className="ml-auto p-1.5 rounded-lg text-neutral-500 hover:text-red-400 disabled:opacity-40"
                aria-label="削除"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default InquiriesPanel;
