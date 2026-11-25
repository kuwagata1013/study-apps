// ゲーム版のグループ機能（フレンドタブの「グループ」の中身）
import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, ChevronDown, Crown, Flame, LogIn, LogOut, Pencil, Plus, RefreshCw, Trash2, UserMinus, UsersRound } from 'lucide-react';
import {
  createGroup,
  dissolveGroup,
  fetchMembers,
  fetchMyGroups,
  joinGroup,
  leaveGroup,
  MAX_GROUP_MEMBERS,
  MAX_GROUP_NAME,
  MAX_GROUPS,
  normalizeCode,
  normalizeGroupName,
  removeMember,
  renameGroup,
  type Group
} from '../../lib/groups';
import type { PlayerProfile } from '../../lib/players';
import { showConfirm, showPrompt } from '../../lib/dialog';
import { CopyBox, todayMinutesOf } from './FriendsPanel';
import { formatMinutes } from './gameStatsUtils';

const inputClass =
  'flex-1 min-w-0 px-3 py-2 bg-[#312117] border border-[#fdd69f]/15 rounded-lg text-xs text-white focus:outline-none focus:border-[#fdd69f]/50';
const submitClass = 'shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-[#fdd69f] text-[#312117] text-[11px] font-bold disabled:opacity-40';
const subClass =
  'flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#fdd69f]/30 text-[#fdd69f] text-[11px] font-bold hover:bg-[#fdd69f]/10 disabled:opacity-40';

export const GroupsPanel: React.FC<{ uid: string }> = ({ uid }) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<Record<string, PlayerProfile[]>>({}); // 招待コードごと
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const loadMembers = useCallback(async (g: Group) => {
    try {
      const list = await fetchMembers(g);
      // 今日たくさん勉強した人が上
      list.sort((a, b) => todayMinutesOf(b) - todayMinutesOf(a));
      setMembers((m) => ({ ...m, [g.code]: list }));
    } catch (e) {
      console.error('メンバーの読み込みに失敗:', e);
    }
  }, []);

  // show: 読み込んだあとに開くグループ
  const load = useCallback(
    async (show?: string | null) => {
      setLoading(true);
      try {
        const list = await fetchMyGroups(uid);
        setGroups(list);
        const target = list.find((g) => g.code === show);
        setOpenCode(target?.code ?? null);
        setMembers({});
        if (target) await loadMembers(target);
      } catch (e) {
        console.error('グループの読み込みに失敗:', e);
        setMessage({ ok: false, text: 'グループを読み込めませんでした。通信状態を確認してください' });
      } finally {
        setLoading(false);
      }
    },
    [uid, loadMembers]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (g: Group) => {
    if (openCode === g.code) return setOpenCode(null);
    setOpenCode(g.code);
    void loadMembers(g);
  };

  // 操作をして、成功したら読み直す
  const run = async (action: () => Promise<{ ok: boolean; text: string; show?: string | null }>) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const { show, ...result } = await action();
      setMessage(result);
      if (result.ok) await load(show);
    } catch (e) {
      console.error('グループの操作に失敗:', e);
      setMessage({ ok: false, text: 'うまくいきませんでした。更新ボタンを押してから、もう一度お試しください' });
    } finally {
      setBusy(false);
    }
  };
  const full = { ok: false, text: `入れるグループは ${MAX_GROUPS} 個までです` };

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = normalizeGroupName(name);
    if (!clean) return;
    void run(async () => {
      if (groups.length >= MAX_GROUPS) return full;
      const created = await createGroup(uid, clean);
      setName('');
      return { ok: true, text: `「${clean}」を作りました！招待コードを教えて、仲間を集めましょう`, show: created };
    });
  };

  const onJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!normalizeCode(code)) return;
    void run(async () => {
      if (groups.length >= MAX_GROUPS) return full;
      const r = await joinGroup(uid, code);
      if (r.status === 'joined') {
        setCode('');
        return { ok: true, text: `「${r.group.name}」に参加しました！`, show: r.group.code };
      }
      return {
        ok: false,
        text: {
          not_found: 'その招待コードのグループは見つかりませんでした',
          already: 'すでに参加しているグループです',
          full: `このグループは満員です（${MAX_GROUP_MEMBERS} 人まで）`
        }[r.status]
      };
    });
  };

  const onRename = async (g: Group) => {
    const next = normalizeGroupName((await showPrompt(`新しいグループ名（${MAX_GROUP_NAME}文字まで）`, g.name)) ?? '');
    if (!next || next === g.name) return;
    void run(async () => {
      await renameGroup(g.code, next);
      return { ok: true, text: 'グループ名を変えました', show: g.code };
    });
  };
  const onKick = async (g: Group, p: PlayerProfile) => {
    if (!(await showConfirm(`${p.name} さんを「${g.name}」から外しますか？\n（招待コードを知っていれば、また参加できます）`, { okLabel: '外す', danger: true }))) return;
    void run(async () => {
      await removeMember(g.code, p.uid);
      return { ok: true, text: `${p.name} さんを外しました`, show: g.code };
    });
  };
  const onLeave = async (g: Group) => {
    const note = g.owner !== uid ? '' : g.members.length > 1 ? '\nリーダーはほかのメンバーに引き継がれます。' : '\nほかにメンバーがいないので、グループはなくなります。';
    if (!(await showConfirm(`「${g.name}」から退出しますか？${note}`, { okLabel: '退出する', danger: true }))) return;
    void run(async () => {
      await leaveGroup(uid, g.code);
      return { ok: true, text: `「${g.name}」から退出しました` };
    });
  };
  const onDissolve = async (g: Group) => {
    if (!(await showConfirm(`「${g.name}」を解散しますか？\nメンバー全員のグループがなくなり、元に戻せません。`, { okLabel: '解散する', danger: true }))) return;
    void run(async () => {
      await dissolveGroup(g.code);
      return { ok: true, text: `「${g.name}」を解散しました` };
    });
  };

  return (
    <>
      <form onSubmit={onCreate} className="p-4 bg-[#1f140d] rounded-2xl border border-[#fdd69f]/15 space-y-2">
        <p className="text-[11px] font-bold text-white/70">新しいグループを作る</p>
        <div className="flex items-center gap-2">
          <input value={name} maxLength={MAX_GROUP_NAME} onChange={(e) => setName(e.target.value)} placeholder="グループ名" autoComplete="off" className={inputClass} />
          <button type="submit" disabled={busy || loading || !normalizeGroupName(name)} className={submitClass}>
            <Plus size={14} /> 作る
          </button>
        </div>
      </form>

      <form onSubmit={onJoin} className="p-4 bg-[#1f140d] rounded-2xl border border-[#fdd69f]/15 space-y-2">
        <p className="text-[11px] font-bold text-white/70">招待コードで参加する</p>
        <div className="flex items-center gap-2">
          <input
            value={code}
            maxLength={20}
            onChange={(e) => setCode(e.target.value)}
            placeholder="招待コード（8文字）"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className={inputClass}
          />
          <button type="submit" disabled={busy || loading || !normalizeCode(code)} className={submitClass}>
            <LogIn size={14} /> 参加
          </button>
        </div>
        <p className="text-[10px] text-white/45">参加すると、名前・レベル・連続日数・今日の勉強時間がメンバーに見えます</p>
      </form>

      {message && (
        <p role="status" className={`text-[11px] ${message.ok ? 'text-emerald-300' : 'text-red-300'}`}>
          {message.text}
        </p>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold text-white/70">参加しているグループ（{groups.length}個）</p>
          <button
            onClick={() => {
              setMessage(null);
              void load(openCode);
            }}
            disabled={loading}
            className="p-1.5 rounded-lg text-[#fdd69f] hover:bg-[#fdd69f]/10 disabled:opacity-40"
            aria-label="グループを更新"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        {groups.length === 0 && (
          <p className="text-xs text-white/45 py-3 text-center">{loading ? '読み込み中…' : 'グループにはまだ入っていません'}</p>
        )}
        {groups.map((g) => {
          const open = openCode === g.code;
          const list = members[g.code];
          const isOwner = g.owner === uid;
          return (
            <div key={g.code} className="rounded-2xl bg-[#1f140d] border border-[#fdd69f]/20">
              <button onClick={() => toggle(g)} aria-expanded={open} className="w-full flex items-center gap-3 p-3 text-left">
                <span className="w-9 h-9 shrink-0 rounded-xl bg-[#fdd69f]/90 text-[#312117] flex items-center justify-center">
                  <UsersRound size={18} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-white truncate">{g.name}</span>
                  <span className="block text-[11px] text-[#fdd69f]/80">
                    {g.members.length}人{isOwner && '・あなたがリーダー'}
                  </span>
                </span>
                <ChevronDown size={16} className={`shrink-0 text-[#fdd69f] transition ${open ? 'rotate-180' : ''}`} />
              </button>

              {open && (
                <div className="px-3 pb-3 space-y-3">
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-white/70">招待コード（仲間に教えてください）</p>
                    <CopyBox text={g.code} />
                  </div>

                  {!list ? (
                    <p className="text-xs text-white/45 py-2 text-center">読み込み中…</p>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-bold text-white/70">
                        今日の合計 <span className="text-[#fdd69f]">{formatMinutes(list.reduce((n, p) => n + todayMinutesOf(p), 0))}</span>（長い順）
                      </p>
                      {list.map((p, i) => (
                        <div key={p.uid} className={`flex items-center gap-2 p-2 rounded-xl border ${p.uid === uid ? 'bg-[#fdd69f]/10 border-[#fdd69f]/50' : 'bg-[#4a3424]/30 border-[#fdd69f]/15'}`}>
                          <span className="w-5 shrink-0 text-center text-xs font-black text-[#fdd69f]">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-white flex items-center gap-1">
                              <span className="truncate">{p.name}</span>
                              {p.uid === g.owner && <Crown size={12} className="shrink-0 text-[#fdd69f]" aria-label="リーダー" />}
                              {p.uid === uid && <span className="shrink-0 text-[10px] text-[#fdd69f]">あなた</span>}
                            </p>
                            <p className="text-[10px] text-[#fdd69f]/80 truncate">
                              Lv.{p.level} {p.title}
                            </p>
                          </div>
                          <div className="shrink-0 flex flex-col items-end">
                            <span className={`flex items-center gap-1 text-[11px] font-bold ${todayMinutesOf(p) > 0 ? 'text-white' : 'text-white/40'}`} title="今日の勉強時間">
                              <BookOpen size={11} className="text-[#fdd69f]" /> {formatMinutes(todayMinutesOf(p))}
                            </span>
                            <span className="flex items-center gap-0.5 text-[10px] font-bold text-[#fdd69f]" title="連続日数">
                              <Flame size={11} /> {p.streakDays}日
                            </span>
                          </div>
                          {isOwner && p.uid !== uid && (
                            <button onClick={() => void onKick(g, p)} disabled={busy} className="shrink-0 p-1.5 text-white/40 hover:text-red-400" aria-label={`${p.name} さんを外す`}>
                              <UserMinus size={15} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {isOwner && (
                      <button onClick={() => void onRename(g)} disabled={busy} className={subClass}>
                        <Pencil size={12} /> 名前を変える
                      </button>
                    )}
                    <button onClick={() => void onLeave(g)} disabled={busy} className={subClass}>
                      <LogOut size={12} /> 退出
                    </button>
                    {isOwner && g.members.length > 1 && (
                      <button
                        onClick={() => void onDissolve(g)}
                        disabled={busy}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-400/30 text-red-200 text-[11px] font-bold hover:bg-red-900/30 disabled:opacity-40"
                      >
                        <Trash2 size={12} /> 解散
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
};

export default GroupsPanel;
