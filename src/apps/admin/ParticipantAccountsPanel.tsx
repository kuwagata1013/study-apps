// 管理者用：参加者ID・プレイヤー名・アカウントIDの対応表
// 参加者IDはアカウントに1つだけ登録され、本人は変更できない。付け替えはここから行う
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Pencil, RefreshCw, Users } from 'lucide-react';
import { adminSetParticipantId, fetchParticipantAccounts, type ParticipantAccount } from '../../lib/accounts';
import { fetchPlayer } from '../../lib/players';
import { fetchAdminUids } from '../../lib/admins';
import { isValidParticipantId, normalizeParticipantId } from '../../lib/participant';

interface Row extends ParticipantAccount {
  name: string;
  isAdmin: boolean;
}

const dateText = (d: Date | null) =>
  d ? `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';

const downloadCsv = (filename: string, headers: string[], rows: unknown[][]) => {
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const body = [headers, ...rows].map((r) => r.map(escape).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const ParticipantAccountsPanel: React.FC = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [accounts, adminUids] = await Promise.all([fetchParticipantAccounts(), fetchAdminUids().catch(() => [] as string[])]);
      const admins = new Set(adminUids);
      const names = await Promise.all(accounts.map((a) => fetchPlayer(a.uid).catch(() => null)));
      setRows(
        accounts
          .map((a, i) => ({ ...a, name: names[i]?.name ?? '', isAdmin: admins.has(a.uid) }))
          .sort((x, y) => x.participantId.localeCompare(y.participantId, 'ja', { numeric: true }))
      );
    } catch (e) {
      console.error('参加者アカウントの読み込みに失敗:', e);
      setError('読み込めませんでした。管理者アカウントでログインしているか、通信状態を確認してください');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 同じ参加者IDを複数のアカウントが使っていないか
  const duplicated = useMemo(() => {
    const count = new Map<string, number>();
    rows.forEach((r) => count.set(r.participantId, (count.get(r.participantId) ?? 0) + 1));
    return new Set([...count].filter(([, n]) => n > 1).map(([id]) => id));
  }, [rows]);

  const onChange = async (r: Row) => {
    const input = prompt(`${r.name || r.uid} の参加者IDを変更します。新しい参加者ID：`, r.participantId);
    if (input === null) return;
    const pid = normalizeParticipantId(input);
    if (!isValidParticipantId(pid)) {
      alert('参加者IDは半角英数字・ハイフン・アンダースコアの32文字までです');
      return;
    }
    if (pid === r.participantId) return;
    try {
      await adminSetParticipantId(r.uid, pid);
      setRows((list) => list.map((x) => (x.uid === r.uid ? { ...x, participantId: pid, updatedAt: new Date() } : x)));
    } catch (e) {
      console.error('参加者IDの変更に失敗:', e);
      alert('変更できませんでした');
    }
  };

  const exportCsv = () =>
    downloadCsv(
      `participant_accounts_${new Date().toISOString().slice(0, 10)}.csv`,
      ['参加者ID', 'プレイヤー名', 'アカウントID', '管理者', '登録日時', '管理者が変更した日時'],
      rows.map((r) => [r.participantId, r.name, r.uid, r.isAdmin ? '管理者' : '', dateText(r.createdAt), dateText(r.updatedAt)])
    );

  return (
    <div className="bg-black rounded-3xl p-6 border border-neutral-800 space-y-4 shadow-xl">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Users size={18} className="text-sky-400" /> 参加者アカウント（{rows.length}件）
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[11px] font-bold border border-neutral-700 disabled:opacity-40"
          >
            <Download size={13} /> CSV
          </button>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="p-2 rounded-xl text-sky-400 hover:bg-sky-500/10 disabled:opacity-40"
            aria-label="更新"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <p className="text-[11px] text-neutral-400 leading-relaxed">
        ログインして使った人の、参加者IDとプレイヤー名・アカウントIDの対応です。参加者IDは最初に使ったものがアカウントに登録され、本人は変更できません。
        ゲスト（未ログイン）で使った記録はここには出ません。
      </p>
      {duplicated.size > 0 && (
        <p className="text-[11px] font-bold text-amber-300">
          ⚠ 同じ参加者IDを複数のアカウントが使っています：{[...duplicated].join('、')}
        </p>
      )}
      {error && <p className="text-[11px] font-bold text-red-400">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-neutral-800">
        <table className="w-full text-xs">
          <thead className="bg-neutral-900 text-neutral-400 text-[10px]">
            <tr>
              <th className="text-left font-bold px-3 py-2 whitespace-nowrap">参加者ID</th>
              <th className="text-left font-bold px-3 py-2 whitespace-nowrap">プレイヤー名</th>
              <th className="text-left font-bold px-3 py-2 whitespace-nowrap">アカウントID</th>
              <th className="text-left font-bold px-3 py-2 whitespace-nowrap">登録日時</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                  {loading ? '読み込み中...' : 'まだ登録はありません'}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.uid} className="border-t border-neutral-800">
                  <td className={`px-3 py-2 font-mono font-bold whitespace-nowrap ${duplicated.has(r.participantId) ? 'text-amber-300' : 'text-white'}`}>
                    {r.participantId}
                  </td>
                  <td className="px-3 py-2 text-neutral-200 whitespace-nowrap">
                    {r.name || <span className="text-neutral-500">（未設定）</span>}
                    {r.isAdmin && (
                      <span className="ml-1.5 text-[9px] font-bold text-purple-200 bg-purple-600/40 border border-purple-400/40 px-1.5 py-0.5 rounded-full">管理者</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-neutral-500 select-all">{r.uid}</td>
                  <td className="px-3 py-2 text-neutral-400 whitespace-nowrap">
                    {dateText(r.createdAt)}
                    {r.updatedAt && <span className="block text-[10px] text-sky-400">変更 {dateText(r.updatedAt)}</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => void onChange(r)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-neutral-700 text-neutral-300 text-[10px] font-bold hover:bg-neutral-800 whitespace-nowrap"
                    >
                      <Pencil size={11} /> 変更
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ParticipantAccountsPanel;
