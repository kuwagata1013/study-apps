// ゲーム版のフレンド機能（フレンドタブの中身・アカウントIDのコピー・プレイヤー名の変更）
// フレンドタブ：届いた申請 → 勉強時間ランキング（今日／今週） → フレンドの追加（ふだんは閉じる）の順に並べる
import React, { useCallback, useEffect, useState } from 'react';
import { Check, ChevronDown, Copy, Mail, Pencil, RefreshCw, Send, Trophy, UserMinus, UserPlus, Users, UsersRound, X } from 'lucide-react';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  fetchFriendRequests,
  fetchFriends,
  fetchPlayer,
  MAX_FRIENDS,
  MAX_NAME_LENGTH,
  normalizeName,
  removeFriend,
  sendFriendRequest,
  type FriendState,
  type PlayerProfile,
  type SendRequestResult
} from '../../lib/players';
import { showConfirm } from '../../lib/dialog';
import GroupsPanel from './GroupsPanel';
import { PeriodSwitch, RankingList, sortByMinutes, type Period } from './PlayerRanking';

export { todayMinutesOf } from './PlayerRanking';

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
export const AccountIdCopy: React.FC<{ uid: string }> = ({ uid }) => <CopyBox text={uid} />;

// 文字とコピーボタン
export const CopyBox: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState<'ok' | 'ng' | null>(null);
  const onCopy = async () => {
    setCopied((await copyText(text)) ? 'ok' : 'ng');
    setTimeout(() => setCopied(null), 2000);
  };
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 min-w-0 truncate font-mono text-[11px] text-white/80 bg-[#312117] border border-[#fdd69f]/15 rounded-lg px-2.5 py-2 select-all">
        {text}
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

const RESULT_TEXT: Record<SendRequestResult, string> = {
  sent: 'フレンド申請を送りました！相手が承認するとフレンドになります',
  accepted: '相手からも申請が届いていたので、フレンドになりました！',
  self: 'それはあなた自身です',
  invalid: 'プレイヤー名かアカウントIDを入力してください',
  not_found: 'その名前・IDの冒険者は見つかりませんでした',
  already: 'すでにフレンドです',
  pending: 'すでに申請しています。相手の承認を待ってください',
  full: `フレンドは ${MAX_FRIENDS} 人までです`
};

// 申請の一覧の1行（レベルと名前）
const RequestRow: React.FC<{ p: PlayerProfile; children: React.ReactNode }> = ({ p, children }) => (
  <div className="flex items-center gap-3 p-2.5 bg-[#1f140d] rounded-xl border border-[#fdd69f]/15">
    <div className="w-9 h-9 shrink-0 rounded-xl bg-[#fdd69f]/90 flex flex-col items-center justify-center">
      <span className="text-[7px] font-bold text-[#312117] leading-none">Lv.</span>
      <span className="text-xs font-black text-[#312117] leading-none">{p.level}</span>
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-bold text-white truncate">{p.name}</p>
      {p.title && <p className="text-[11px] text-[#fdd69f]/80 truncate">{p.title}</p>}
    </div>
    <div className="shrink-0 flex items-center gap-1.5">{children}</div>
  </div>
);

const VIEW_KEY = 'friends_view';
const PERIOD_KEY = 'friends_period';
const loadPref = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v as T) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
};
const savePref = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 無視
  }
};

const card = 'p-4 bg-[#1f140d] rounded-2xl border border-[#fdd69f]/15';

// フレンドタブ（フレンドとグループを切り替える）
// onIncomingCount: 届いている申請の数が変わったら知らせる（タブの印に使う）
export const FriendsPanel: React.FC<{ uid: string | null; onIncomingCount?: (n: number) => void }> = ({ uid, onIncomingCount }) => {
  const [view, setViewState] = useState<'friends' | 'groups'>(() => loadPref(VIEW_KEY, ['friends', 'groups'] as const, 'friends'));
  const [period, setPeriodState] = useState<Period>(() => loadPref(PERIOD_KEY, ['today', 'week'] as const, 'today'));
  const [me, setMe] = useState<PlayerProfile | null>(null);
  const [friends, setFriends] = useState<PlayerProfile[]>([]);
  const [incoming, setIncoming] = useState<PlayerProfile[]>([]);
  const [outgoing, setOutgoing] = useState<PlayerProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const setView = (v: 'friends' | 'groups') => {
    setViewState(v);
    savePref(VIEW_KEY, v);
  };
  const setPeriod = (p: Period) => {
    setPeriodState(p);
    savePref(PERIOD_KEY, p);
  };

  // お知らせは少したったら消す
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 6000);
    return () => clearTimeout(t);
  }, [message]);

  const friendState = (): FriendState => ({
    friendIds: friends.map((f) => f.uid),
    incomingIds: incoming.map((p) => p.uid),
    outgoingIds: outgoing.map((p) => p.uid)
  });

  useEffect(() => {
    onIncomingCount?.(incoming.length);
  }, [incoming.length, onIncomingCount]);

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const [list, requests, mine] = await Promise.all([fetchFriends(uid), fetchFriendRequests(uid), fetchPlayer(uid).catch(() => null)]);
      setFriends(list);
      setIncoming(requests.incoming);
      setOutgoing(requests.outgoing);
      setMe(mine);
    } catch (e) {
      console.error('フレンドの読み込みに失敗:', e);
      setMessage({ ok: false, text: 'フレンドを読み込めませんでした。通信状態を確認してください' });
    } finally {
      setLoading(false);
      setLoaded(true);
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
      const result = await sendFriendRequest(uid, input, friendState());
      const ok = result === 'sent' || result === 'accepted';
      setMessage({ ok, text: RESULT_TEXT[result] });
      if (ok) {
        setInput('');
        await load();
      }
    } catch (err) {
      console.error('フレンド申請に失敗:', err);
      setMessage({ ok: false, text: '申請できませんでした。通信状態を確認して、もう一度お試しください' });
    } finally {
      setAdding(false);
    }
  };

  // 届いた申請への返事（承認・拒否）と、送った申請の取り消し
  const respond = async (p: PlayerProfile, action: 'accept' | 'decline' | 'cancel') => {
    if (!uid || busyId) return;
    if (action === 'accept' && friends.length >= MAX_FRIENDS) {
      setMessage({ ok: false, text: RESULT_TEXT.full });
      return;
    }
    if (action === 'decline' && !(await showConfirm(`${p.name} さんからの申請を断りますか？`, { okLabel: '断る' }))) return;
    setBusyId(p.uid);
    setMessage(null);
    try {
      if (action === 'accept') {
        await acceptFriendRequest(uid, p.uid, friendState());
        setMessage({ ok: true, text: `${p.name} さんとフレンドになりました！` });
        await load();
      } else if (action === 'decline') {
        await declineFriendRequest(uid, p.uid);
        setIncoming((list) => list.filter((x) => x.uid !== p.uid));
      } else {
        await cancelFriendRequest(uid, p.uid);
        setOutgoing((list) => list.filter((x) => x.uid !== p.uid));
      }
    } catch (err) {
      console.error('フレンド申請の処理に失敗:', err);
      setMessage({ ok: false, text: 'うまくいきませんでした。更新ボタンを押してから、もう一度お試しください' });
    } finally {
      setBusyId(null);
    }
  };

  const onRemove = async (f: PlayerProfile) => {
    if (!uid || !(await showConfirm(`${f.name} さんをフレンドから外しますか？（相手のフレンド一覧からも外れます）`, { okLabel: '外す', danger: true }))) return;
    try {
      await removeFriend(uid, f.uid);
      setFriends((list) => list.filter((x) => x.uid !== f.uid));
      setMessage({ ok: true, text: `${f.name} さんをフレンドから外しました` });
    } catch (err) {
      console.error('フレンド削除に失敗:', err);
      setMessage({ ok: false, text: 'フレンドを外せませんでした' });
    }
  };

  // ランキングには自分も入れて比べられるようにする
  const ranking = me ? [me, ...friends.filter((f) => f.uid !== me.uid)] : friends;
  const myRank = me ? sortByMinutes(ranking, period).findIndex((p) => p.uid === me.uid) + 1 : 0;

  const addPanel = uid && (
    <div className={`${card} space-y-4`}>
      <form onSubmit={onAdd} className="space-y-2">
        <p className="text-[11px] font-bold text-white/70">プレイヤー名かアカウントIDで申請する</p>
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
            <UserPlus size={14} /> {adding ? '申請中' : '申請'}
          </button>
        </div>
      </form>
      <div className="space-y-2">
        <p className="text-[11px] font-bold text-white/70">あなたのアカウントID（相手に教えて申請してもらうこともできます）</p>
        <AccountIdCopy uid={uid} />
        {me?.name && (
          <p className="text-[10px] text-white/45">
            プレイヤー名「<span className="text-[#fdd69f]">{me.name}</span>」でも見つけてもらえます
          </p>
        )}
      </div>
      {outgoing.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-white/70">
            <Send size={12} /> 承認待ちの申請（{outgoing.length}件）
          </p>
          {outgoing.map((p) => (
            <RequestRow key={p.uid} p={p}>
              <button
                onClick={() => void respond(p, 'cancel')}
                disabled={!!busyId}
                className="px-2.5 py-1.5 rounded-lg border border-white/20 text-white/70 text-[11px] font-bold hover:bg-white/5 disabled:opacity-40"
              >
                取り消す
              </button>
            </RequestRow>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-[#312117]/90 rounded-3xl p-5 md:p-6 shadow-xl border border-[#fdd69f]/20 space-y-4 md:max-w-lg md:mx-auto">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Users size={18} className="text-[#fdd69f]" /> フレンド・グループ
        </h2>
        {uid && view === 'friends' && (
          <button
            onClick={() => void load()}
            disabled={loading}
            className="p-1.5 rounded-lg text-[#fdd69f] hover:bg-[#fdd69f]/10 disabled:opacity-40"
            aria-label="フレンドを更新"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {uid && (
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#1f140d] border border-[#fdd69f]/20">
          {(
            [
              ['friends', 'フレンド', <Users size={14} key="i" />],
              ['groups', 'グループ', <UsersRound size={14} key="i" />]
            ] as const
          ).map(([id, label, icon]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              aria-pressed={view === id}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition ${
                view === id ? 'bg-[#fdd69f] text-[#312117]' : 'text-[#fdd69f]/70 hover:text-[#fdd69f]'
              }`}
            >
              {icon}
              {label}
              {id === 'friends' && incoming.length > 0 && (
                <span className="min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] leading-4" aria-label={`フレンド申請 ${incoming.length} 件`}>
                  {incoming.length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {!uid ? (
        <div className="p-6 bg-[#1f140d] rounded-2xl border border-[#fdd69f]/15 text-center space-y-2">
          <Users size={32} className="mx-auto text-[#fdd69f]/60" />
          <p className="text-sm font-bold text-white">ログインするとフレンドとグループが使えます</p>
          <p className="text-xs text-white/55">プロフィールの「モードを再選択する」からスタート画面に戻り、配られた参加者IDとパスワードでログインしてください</p>
        </div>
      ) : view === 'groups' ? (
        <GroupsPanel uid={uid} period={period} onPeriodChange={setPeriod} />
      ) : (
        <>
          {message && (
            <p role="status" className={`px-3 py-2 rounded-xl text-[11px] font-bold ${message.ok ? 'bg-emerald-500/15 text-emerald-200' : 'bg-red-500/15 text-red-200'}`}>
              {message.text}
            </p>
          )}

          {/* 届いた申請はいちばん上に */}
          {incoming.length > 0 && (
            <div className="p-3 rounded-2xl bg-[#fdd69f]/10 border border-[#fdd69f]/50 space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-bold text-[#fdd69f]">
                <Mail size={14} /> フレンド申請が {incoming.length} 件届いています
              </p>
              {incoming.map((p) => (
                <RequestRow key={p.uid} p={p}>
                  <button
                    onClick={() => void respond(p, 'accept')}
                    disabled={!!busyId}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#fdd69f] text-[#312117] text-[11px] font-bold disabled:opacity-40"
                  >
                    <Check size={13} /> 承認
                  </button>
                  <button
                    onClick={() => void respond(p, 'decline')}
                    disabled={!!busyId}
                    className="px-2.5 py-1.5 rounded-lg border border-white/20 text-white/70 text-[11px] font-bold hover:bg-white/5 disabled:opacity-40"
                  >
                    断る
                  </button>
                </RequestRow>
              ))}
            </div>
          )}

          {/* ランキング */}
          <div className={`${card} space-y-3`}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Trophy size={14} className="text-[#fdd69f]" /> 勉強時間ランキング
                </p>
                <p className="text-[10px] text-white/50">
                  {myRank > 0 && friends.length > 0 ? `あなたは ${ranking.length} 人中 ${myRank} 位` : `フレンド ${friends.length} / ${MAX_FRIENDS} 人`}
                </p>
              </div>
              <PeriodSwitch value={period} onChange={setPeriod} />
            </div>

            {!loaded && loading ? (
              <p className="text-xs text-white/45 py-4 text-center">読み込み中…</p>
            ) : friends.length === 0 ? (
              <div className="py-4 text-center space-y-2">
                <UserPlus size={28} className="mx-auto text-[#fdd69f]/50" />
                <p className="text-sm font-bold text-white">まだフレンドがいません</p>
                <p className="text-[11px] text-white/55">フレンドになると、おたがいの今日・今週の勉強時間を見て競えます</p>
              </div>
            ) : (
              <RankingList
                players={ranking}
                period={period}
                myUid={uid}
                actions={(p) =>
                  p.uid === uid ? null : (
                    <button
                      onClick={() => void onRemove(p)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-400/30 text-red-200 text-[11px] font-bold hover:bg-red-900/30"
                    >
                      <UserMinus size={12} /> フレンドから外す
                    </button>
                  )
                }
              />
            )}
            {friends.length > 0 && <p className="text-[10px] text-white/40 text-center">名前を押すと今週の日ごとの時間が見られます（午前4時で日付が変わります）</p>}
          </div>

          {/* フレンドを追加（ふだんは閉じておく。フレンドがいないときは開いておく） */}
          {friends.length === 0 && loaded ? (
            addPanel
          ) : (
            <div className="space-y-2">
              <button
                onClick={() => setAddOpen((o) => !o)}
                aria-expanded={addOpen}
                className="w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl border border-[#fdd69f]/30 text-[#fdd69f] text-xs font-bold hover:bg-[#fdd69f]/10 transition"
              >
                <UserPlus size={15} /> フレンドを追加する
                {outgoing.length > 0 && <span className="text-[10px] text-white/50">（承認待ち {outgoing.length}）</span>}
                <ChevronDown size={14} className={`transition ${addOpen ? 'rotate-180' : ''}`} />
              </button>
              {addOpen && addPanel}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FriendsPanel;
