// 管理者用：参加者ID＋パスワードのアカウントをまとめて発行する
// パスワードはどこにも保存しないので、発行したらすぐ CSV で保存してもらう
import React, { useState } from 'react';
import { AlertTriangle, Download, KeyRound } from 'lucide-react';
import { issueParticipantAccount, parseParticipantIds, type IssueResult } from '../../lib/participantAuth';
import { isValidParticipantId } from '../../lib/participant';
import { showConfirm } from '../../lib/dialog';

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

const STATUS_TEXT: Record<IssueResult['status'], string> = { created: '発行', exists: 'すでにある', error: '失敗' };

export const IssueAccountsForm: React.FC<{ onIssued?: () => void }> = ({ onIssued }) => {
  const [text, setText] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<IssueResult[]>([]);
  const [saved, setSaved] = useState(false);

  const ids = parseParticipantIds(text);
  const invalid = ids.filter((id) => !isValidParticipantId(id));
  const created = results.filter((r) => r.status === 'created');

  const saveCsv = () => {
    downloadCsv(
      `participant_passwords_${new Date().toISOString().slice(0, 10)}.csv`,
      ['参加者ID', 'パスワード'],
      created.map((r) => [r.participantId, r.password])
    );
    setSaved(true);
  };

  const run = async () => {
    if (running || ids.length === 0 || invalid.length > 0) return;
    if (created.length > 0 && !saved && !(await showConfirm('前回発行したパスワードを CSV に保存していません。表示が消えますが、続けますか？'))) return;
    if (!(await showConfirm(`${ids.length} 件のアカウントを発行します。よろしいですか？`))) return;
    setRunning(true);
    setSaved(false);
    setResults([]);
    setProgress({ done: 0, total: ids.length });
    const out: IssueResult[] = [];
    for (const id of ids) {
      const r = await issueParticipantAccount(id);
      out.push(r);
      setResults([...out]);
      setProgress({ done: out.length, total: ids.length });
      // 設定が有効になっていないなどで全部失敗する場合は、1件目で止める
      if (r.status === 'error' && out.length === 1 && r.message?.includes('Firebase コンソール')) break;
    }
    setRunning(false);
    onIssued?.();
  };

  return (
    <div className="bg-black rounded-3xl p-6 border border-neutral-800 space-y-4 shadow-xl">
      <h2 className="text-sm font-bold text-white flex items-center gap-2">
        <KeyRound size={18} className="text-sky-400" /> 参加者アカウントを発行
      </h2>
      <p className="text-[11px] text-neutral-400 leading-relaxed">
        参加者IDを1行に1つずつ、または「A01~A30」のように範囲で入力してください。パスワードは自動で作ります。
        生徒は参加者IDとパスワードでログインし、プレイヤー名は自分で決めます。
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder={'A01~A30\nB01\nB02'}
        className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-sky-500"
      />
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className={invalid.length ? 'text-red-400 font-bold' : 'text-neutral-400'}>
          {invalid.length ? `使えないID：${invalid.slice(0, 5).join('、')}${invalid.length > 5 ? ' ほか' : ''}` : `${ids.length} 件`}
        </span>
        <button
          onClick={() => void run()}
          disabled={running || ids.length === 0 || invalid.length > 0}
          className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold disabled:opacity-40"
        >
          {running ? `発行中 ${progress.done}/${progress.total}` : '発行する'}
        </button>
      </div>

      {results.length > 0 && (
        <div className="space-y-3">
          {created.length > 0 && (
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
              <p className="flex items-start gap-1.5 text-[11px] font-bold text-amber-300">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                パスワードはどこにも保存されていません。この画面を閉じると二度と表示できないので、必ず CSV を保存してください。
              </p>
              <button
                onClick={saveCsv}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold"
              >
                <Download size={14} /> 参加者IDとパスワードを CSV で保存（{created.length}件）
              </button>
              {saved && <p className="text-[11px] text-emerald-300">保存しました。CSV はほかの人に見られない場所で管理してください。</p>}
            </div>
          )}
          <div className="max-h-64 overflow-y-auto rounded-2xl border border-neutral-800">
            <table className="w-full text-xs">
              <thead className="bg-neutral-900 text-neutral-400 text-[10px] sticky top-0">
                <tr>
                  <th className="text-left font-bold px-3 py-2">参加者ID</th>
                  <th className="text-left font-bold px-3 py-2">パスワード</th>
                  <th className="text-left font-bold px-3 py-2">結果</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.participantId} className="border-t border-neutral-800">
                    <td className="px-3 py-1.5 font-mono font-bold text-white">{r.participantId}</td>
                    <td className="px-3 py-1.5 font-mono text-sky-300 select-all">{r.password}</td>
                    <td
                      className={`px-3 py-1.5 ${
                        r.status === 'created' ? 'text-emerald-300' : r.status === 'exists' ? 'text-neutral-400' : 'text-red-400'
                      }`}
                    >
                      {STATUS_TEXT[r.status]}
                      {r.message && <span className="block text-[10px] opacity-80">{r.message}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default IssueAccountsForm;
