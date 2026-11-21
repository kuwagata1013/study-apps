// ログイン後、最初に自分のプレイヤー名を決める画面
// Google アカウントの名前はそのまま使わない。名前は1人1つ（フレンドが名前で探せるように）
import React, { useState } from 'react';
import { LogOut, UserRound } from 'lucide-react';
import { claimPlayerName, MAX_NAME_LENGTH, normalizeName } from '../../lib/players';

interface Props {
  uid: string;
  initialName?: string;
  onDone: (name: string) => void;
  onLogout: () => void;
}

export const NameSetup: React.FC<Props> = ({ uid, initialName = '', onDone, onLogout }) => {
  const [input, setInput] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const name = normalizeName(input);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || saving) return;
    setSaving(true);
    setError('');
    try {
      const result = await claimPlayerName(uid, name);
      if (result === 'ok') onDone(name);
      else setError(result === 'taken' ? 'この名前はほかの人が使っています。別の名前にしてください' : '名前を入力してください');
    } catch (err) {
      console.error('名前の登録に失敗:', err);
      setError('保存できませんでした。通信状態を確認して、もう一度お試しください');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col justify-center items-center p-4 antialiased">
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-5">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <UserRound size={24} />
          </div>
          <h1 className="text-lg font-extrabold text-gray-900">プレイヤー名を決めよう</h1>
          <p className="text-xs text-gray-500 leading-relaxed">
            フレンドはこの名前であなたを探せます。
            <br />
            本名ではなくニックネームがおすすめです。
          </p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-bold text-gray-700">プレイヤー名（{MAX_NAME_LENGTH}文字まで）</span>
          <input
            autoFocus
            value={input}
            maxLength={MAX_NAME_LENGTH}
            onChange={(e) => {
              setInput(e.target.value);
              setError('');
            }}
            autoComplete="off"
            placeholder="ニックネームを入力"
            className={`w-full px-3 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 ${
              error ? 'border-red-400' : 'border-gray-200'
            }`}
          />
          {error && <p className="text-[11px] font-semibold text-red-500">{error}</p>}
          <p className="text-[10px] text-gray-400">あとからプロフィールで変えられます</p>
        </label>

        <button
          type="submit"
          disabled={!name || saving}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-md transition text-sm disabled:opacity-40"
        >
          {saving ? '確認中...' : 'この名前ではじめる'}
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-600"
        >
          <LogOut size={12} /> ログアウトしてゲストで使う
        </button>
      </form>
    </div>
  );
};

export default NameSetup;
