// ゲーム版のフレンド機能（フレンドタブの中身・アカウントIDのコピー・プレイヤー名の変更）
import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Flame, Pencil, RefreshCw, Trash2, UserPlus, Users, X } from 'lucide-react';
import {
  addFriend,
  fetchFriends,
  MAX_FRIENDS,
  MAX_NAME_LENGTH,
  normalizeName,
  removeFriend,
  type AddFriendResult,
  type PlayerProfile
} from '../../lib/players';

// クリップボードにコピー（使えない環境では選択してコピーする方法に切り替える）
const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
};

// アカウントIDとコピーボタン
export const AccountIdCopy: React.FC<{ uid: string }> = ({ uid }) => {
  const [copied, setCopied] = useState<'ok' | 'ng' | null>(null);
  const onCopy = async () => {
    setCopied((await copyText(uid)) ? 'ok' : 'ng');
    setTimeout(() => setCopied(null), 2000);
  };
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 min-w-0 truncate font-mono text-[11px] text-white/80 bg-[#312117] border border-[#fdd69f]/15 rounded-lg px-2.5 py-2 select-all">
        {uid}
      </code>
      <button
        onClick={onCopy}
        className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-[#fdd69f] text-[#312117] text-[11px] font-bold hover:bg-[#ffe3b8] transition"
      >
        {copied === 'ok' ? <Check size={14} /> : <Copy size={14} />}
        {copied === 'ok' ? 'コピー済み' : copied === 'ng' ? 'コピー不可' : 'コピー'}
      </button>
    </div>
  );
};

// プレイヤー名の表示と変更
// onSave はエラー文（なければ null）を返す
export const PlayerNameEditor: React.FC<{ name: string; onSave: (name: string) => Promise<string | null> }> = ({
  name,
  onSave
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-white text-sm truncate">{name}</span>
        <button
          onClick={() => {
            setDraft(name);
            setError('');
            setEditing(true);
          }}
          className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#fdd69f]/30 text-[#fdd69f] text-[11px] font-bold hover:bg-[#fdd69f]/10 transition"
        >
          <Pencil size={12} /> 変更
        </button>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = normalizeName(draft);
    if (!next || saving) return;
    if (next === name) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError('');
    const err = await onSave(next);
    setSaving(false);
    if (err) setError(err);
    else setEditing(false);
  };

  return (
    <form onSubmit={submit} className="space-y-1">
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={draft}
        maxLength={MAX_NAME_LENGTH}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="プレイヤー名"
        className="flex-1 min-w-0 px-3 py-2 bg-[#312117] border border-[#fdd69f]/30 rounded-lg text-xs text-white focus:outline-none focus:border-[#fdd69f]/60"
      />
      <button
        type="submit"
        disabled={!normalizeName(draft) || saving}
        className="shrink-0 px-3 py-2 rounded-lg bg-[#fdd69f] text-[#312117] text-[11px] font-bold disabled:opacity-40"
      >
        {saving ? '保存中' : '保存'}
      </button>
      <button type="button" onClick={() => setEditing(false)} className="shrink-0 p-2 text-white/60 hover:text-white" aria-label="やめる">
        <X size={14} />
      </button>
    </div>
      {error && <p className="text-[11px] text-red-300">{error}</p>}
    </form>
  );
};

const RESULT_TEXT: Record<AddFriendResult, string> = {
  added: 'フレンドに追加しました！',
  self: 'それはあなた自身です',
  invalid: 'プレイヤー名かアカウントIDを入力してください',
  not_found: 'その名前・IDの冒険者は見つかりませんでした',
  already: 'すでにフレンドです',
  full: `フレンドは ${MAX_FRIENDS} 人までです`
};

// フレンドタブ
export const FriendsPanel: React.FC<{ uid: string | null }> = ({ uid }) => {
  const [friends, setFriends] = useState<PlayerProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      setFriends(await fetchFriends(uid));
    } catch (e) {
      console.error('フレンドの読み込みに失敗:', e);
      setMessage({ ok: false, text: 'フレンドを読み込めませんでした。通信状態を確認してください' });
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid || !input.trim()) return;
    setAdding(true);
    setMessage(null);
    try {
      const result = await addFriend(uid, input, friends.map((f) => f.uid));
      setMessage({ ok: result === 'added', text: RESULT_TEXT[result] });
      if (result === 'added') {
        setInput('');
        await load();
      }
    } catch (err) {
      console.error('フレンド追加に失敗:', err);
      setMessage({ ok: false, text: '追加できませんでした。通信状態を確認してください' });
    } finally {
      setAdding(false);
    }
  };

  const onRemove = async (f: PlayerProfile) => {
    if (!uid || !confirm(`${f.name} さんをフレンドから外しますか？`)) return;
    try {
      await removeFriend(uid, f.uid);
      setFriends((list) => list.filter((x) => x.uid !== f.uid));
    } catch (err) {
      console.error('フレンド削除に失敗:', err);
      setMessage({ ok: false, text: 'フレンドを外せませんでした' });
    }
  };

  return (
    <div className="bg-[#312117]/90 rounded-3xl p-5 md:p-6 shadow-xl border border-[#fdd69f]/20 space-y-4 md:max-w-lg md:mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Users size={18} className="text-[#fdd69f]" /> フレンド
        </h2>
        {uid && (
          <button
            onClick={() => void load()}
            disabled={loading}
            className="p-1.5 rounded-lg text-[#fdd69f] hover:bg-[#fdd69f]/10 disabled:opacity-40"
            aria-label="更新"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {!uid ? (
        <div className="p-6 bg-[#1f140d] rounded-2xl border border-[#fdd69f]/15 text-center space-y-2">
          <Users size={32} className="mx-auto text-[#fdd69f]/60" />
          <p className="text-sm font-bold text-white">ログインするとフレンド機能が使えます</p>
          <p className="text-xs text-white/55">プロフィールの「モードを再選択する」からスタート画面に戻り、Google でログインしてください</p>
        </div>
      ) : (
        <>
          <div className="p-4 bg-[#1f140d] rounded-2xl border border-[#fdd69f]/15 space-y-2">
            <p className="text-[11px] font-bold text-white/70">あなたのアカウントID（名前のかわりに教えることもできます）</p>
            <AccountIdCopy uid={uid} />
          </div>

          <form onSubmit={onAdd} className="p-4 bg-[#1f140d] rounded-2xl border border-[#fdd69f]/15 space-y-2">
            <p className="text-[11px] font-bold text-white/70">フレンドのプレイヤー名かアカウントIDで追加</p>
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="プレイヤー名 または アカウントID"
                autoComplete="off"
                spellCheck={false}
                className="flex-1 min-w-0 px-3 py-2 bg-[#312117] border border-[#fdd69f]/15 rounded-lg text-xs text-white focus:outline-none focus:border-[#fdd69f]/50"
              />
              <button
                type="submit"
                disabled={adding || !input.trim()}
                className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-[#fdd69f] text-[#312117] text-[11px] font-bold disabled:opacity-40"
              >
                <UserPlus size={14} /> 追加
              </button>
            </div>
            {message && <p className={`text-[11px] ${message.ok ? 'text-emerald-300' : 'text-red-300'}`}>{message.text}</p>}
          </form>

          <div className="space-y-2">
            <p className="text-[11px] font-bold text-white/70">
              フレンド一覧（{friends.length}人）
            </p>
            {friends.length === 0 ? (
              <p className="text-xs text-white/45 py-3 text-center">{loading ? '読み込み中…' : 'フレンドはまだいません'}</p>
            ) : (
              friends.map((f) => (
                <div key={f.uid} className="flex items-center gap-3 p-3 rounded-xl bg-[#4a3424]/30 border border-[#fdd69f]/20">
                  <div className="w-10 h-10 shrink-0 rounded-xl bg-[#fdd69f] flex flex-col items-center justify-center">
                    <span className="text-[7px] font-bold text-[#312117] leading-none">Lv.</span>
                    <span className="text-sm font-black text-[#312117] leading-none">{f.level}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{f.name}</p>
                    <p className="text-[11px] text-[#fdd69f]/80 truncate">{f.title}</p>
                  </div>
                  <span className="shrink-0 flex items-center gap-0.5 text-xs font-bold text-[#fdd69f]">
                    <Flame size={13} /> {f.streakDays}日
                  </span>
                  <button onClick={() => void onRemove(f)} className="shrink-0 p-1 text-white/40 hover:text-red-400" aria-label="フレンドから外す">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default FriendsPanel;
