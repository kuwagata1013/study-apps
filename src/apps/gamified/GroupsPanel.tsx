// ゲーム版のグループ機能（フレンドタブの「グループ」の中身）
// 参加しているグループ（開くと今日／今週のランキングと、グループ全体の今週のグラフ） → 作る・参加する の順
import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, LogIn, LogOut, Pencil, Plus, RefreshCw, Trash2, UserMinus, UsersRound } from 'lucide-react';
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
import { CopyBox } from './FriendsPanel';
import { formatMinutes } from './gameStatsUtils';
import { PeriodSwitch, RankingList, WeekBars, todayMinutesOf, weekDaysOf, weekMinutesOf, type Period } from './PlayerRanking';

const inputClass =
  'flex-1 min-w-0 px-3 py-2 bg-[#312117] border border-[#fdd69f]/15 rounded-lg text-xs text-white focus:outline-none focus:border-[#fdd69f]/50';
const submitClass = 'shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-[#fdd69f] text-[#312117] text-[11px] font-bold disabled:opacity-40';
const subClass =
  'flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#fdd69f]/30 text-[#fdd69f] text-[11px] font-bold hover:bg-[#fdd69f]/10 disabled:opacity-40';

export const GroupsPanel: React.FC<{ uid: string; period: Period; onPeriodChange: (p: Period) => void }> = ({ uid, period, onPeriodChange }) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<Record<string, PlayerProfile[]>>({}); // 招待コードごと
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  // お知らせは少したったら消す
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 6000);
    return () => clearTimeout(t);
  }, [message]);

  const loadMembers = useCallback(async (g: Group) => {
    try {
      const list = await fetchMembers(g);
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
        // 指定がなければ、グループが1つだけのときはそれを開いておく
        const target = list.find((g) => g.code === show) ?? (show === undefined && list.length === 1 ? list[0] : undefined);
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

  const forms = (
    <div className="space-y-3">
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
      </form>
      <form onSubmit={onCreate} className="p-4 bg-[#1f140d] rounded-2xl border border-[#fdd69f]/15 space-y-2">
        <p className="text-[11px] font-bold text-white/70">新しいグループを作る</p>
        <div className="flex items-center gap-2">
          <input value={name} maxLength={MAX_GROUP_NAME} onChange={(e) => setName(e.target.value)} placeholder="グループ名" autoComplete="off" className={inputClass} />
          <button type="submit" disabled={busy || loading || !normalizeGroupName(name)} className={submitClass}>
            <Plus size={14} /> 作る
          </button>
        </div>
      </form>
      <p className="text-[10px] text-white/45">参加すると、名前・レベル・連続日数・今日と今週の勉強時間がメンバーに見えます</p>
    </div>
  );

  return (
    <>
      {message && (
        <p role="status" className={`px-3 py-2 rounded-xl text-[11px] font-bold ${message.ok ? 'bg-emerald-500/15 text-emerald-200' : 'bg-red-500/15 text-red-200'}`}>
          {message.text}
        </p>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold text-white/70">
            参加しているグループ（{groups.length} / {MAX_GROUPS}）
          </p>
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
          <div className="py-4 text-center space-y-2">
            <UsersRound size={28} className="mx-auto text-[#fdd69f]/50" />
            <p className="text-sm font-bold text-white">{loading ? '読み込み中…' : 'グループにはまだ入っていません'}</p>
            {!loading && <p className="text-[11px] text-white/55">招待コードで参加するか、自分で作って仲間を誘いましょう</p>}
          </div>
        )}
        {groups.map((g) => {
          const open = openCode === g.code;
          const list = members[g.code];
          const isOwner = g.owner === uid;
          const weekTotal = list ? list.reduce((n, p) => n + weekMinutesOf(p), 0) : 0;
          const todayTotal = list ? list.reduce((n, p) => n + todayMinutesOf(p), 0) : 0;
          const weekSum = list ? [0, 1, 2, 3, 4, 5, 6].map((i) => list.reduce((n, p) => n + weekDaysOf(p)[i], 0)) : [];
          return (
            <div key={g.code} className={`rounded-2xl bg-[#1f140d] border ${open ? 'border-[#fdd69f]/45' : 'border-[#fdd69f]/20'}`}>
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
                  {!list ? (
                    <p className="text-xs text-white/45 py-2 text-center">読み込み中…</p>
                  ) : (
                    <>
                      {/* グループ全体の今週 */}
                      <div className="p-3 rounded-xl bg-[#312117] border border-[#fdd69f]/15 space-y-2">
                        <div className="flex items-end justify-between gap-2">
                          <div>
                            <p className="text-[10px] font-bold text-white/60">グループの今週の合計</p>
                            <p className="text-lg font-black text-[#fdd69f] tabular-nums leading-tight">{formatMinutes(weekTotal)}</p>
                          </div>
                          <p className="text-[10px] text-white/60 text-right">
                            今日 <span className="font-bold text-white">{formatMinutes(todayTotal)}</span>
                            <br />1人平均 {formatMinutes(list.length ? weekTotal / list.length : 0)}
                          </p>
                        </div>
                        <WeekBars days={weekSum} height={48} showValues />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-bold text-white/70">メンバーのランキング</p>
                          <PeriodSwitch value={period} onChange={onPeriodChange} />
                        </div>
                        <RankingList
                          players={list}
                          period={period}
                          myUid={uid}
                          ownerUid={g.owner}
                          actions={(p) =>
                            isOwner && p.uid !== uid ? (
                              <button
                                onClick={() => void onKick(g, p)}
                                disabled={busy}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-400/30 text-red-200 text-[11px] font-bold hover:bg-red-900/30 disabled:opacity-40"
                              >
                                <UserMinus size={12} /> グループから外す
                              </button>
                            ) : null
                          }
                        />
                      </div>
                    </>
                  )}

                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-white/70">招待コード（仲間に教えてください）</p>
                    <CopyBox text={g.code} />
                  </div>

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

      {/* 作る・参加する（グループがないときは開いておく） */}
      {groups.length === 0 && !loading ? (
        forms
      ) : (
        <div className="space-y-2">
          <button
            onClick={() => setFormOpen((o) => !o)}
            aria-expanded={formOpen}
            className="w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl border border-[#fdd69f]/30 text-[#fdd69f] text-xs font-bold hover:bg-[#fdd69f]/10 transition"
          >
            <Plus size={15} /> グループを作る・参加する
            <ChevronDown size={14} className={`transition ${formOpen ? 'rotate-180' : ''}`} />
          </button>
          {formOpen && forms}
        </div>
      )}
    </>
  );
};

export default GroupsPanel;
