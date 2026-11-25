// 管理者用：グループの一覧。どのグループにも、参加者を選んで追加・外すことができる
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Crown, RefreshCw, Search, UserMinus, UserPlus, UsersRound } from 'lucide-react';
import { fetchParticipantAccounts } from '../../lib/accounts';
import { adminAddMembers, fetchAllGroups, leaveGroup, MAX_GROUP_MEMBERS, type Group } from '../../lib/groups';
import { fetchPlayer } from '../../lib/players';
import { showConfirm } from '../../lib/dialog';

interface Person {
  uid: string;
  participantId: string;
  name: string;
}

export const AdminGroupsPanel: React.FC = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, accounts] = await Promise.all([fetchAllGroups(), fetchParticipantAccounts()]);
      // 参加者IDの登録がないメンバーも名前を出せるように、両方を合わせて読む
      const pid = new Map(accounts.map((a) => [a.uid, a.participantId]));
      const uids = [...new Set([...pid.keys(), ...list.flatMap((g) => g.members)])];
      const players = await Promise.all(uids.map((uid) => fetchPlayer(uid).catch(() => null)));
      setGroups(list);
      setPeople(
        uids
          .map((uid, i) => ({ uid, participantId: pid.get(uid) ?? '', name: players[i]?.name ?? '' }))
          .sort((a, b) => a.participantId.localeCompare(b.participantId, 'ja', { numeric: true }))
      );
    } catch (e) {
      console.error('グループの読み込みに失敗:', e);
      setMessage({ ok: false, text: '読み込めませんでした。管理者アカウントでログインしているか、通信状態を確認してください' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byUid = useMemo(() => new Map(people.map((p) => [p.uid, p])), [people]);
  const label = (uid: string) => {
    const p = byUid.get(uid);
    return p?.name || p?.participantId || uid;
  };

  const toggle = (code: string) => {
    setOpenCode(openCode === code ? null : code);
    setPicked([]);
    setSearch('');
    setMessage(null);
  };

  const run = async (action: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ ok: true, text: await action() });
      setPicked([]);
      await load();
    } catch (e) {
      console.error('グループの操作に失敗:', e);
      setMessage({ ok: false, text: 'うまくいきませんでした。更新ボタンを押してから、もう一度お試しください' });
    } finally {
      setBusy(false);
    }
  };

  const onAdd = (g: Group) =>
    run(async () => {
      await adminAddMembers(g.code, picked);
      return `「${g.name}」に ${picked.length} 人を追加しました`;
    });

  const onRemove = async (g: Group, uid: string) => {
    const note =
      g.members.length === 1
        ? '\nほかにメンバーがいないので、グループはなくなります。'
        : g.owner === uid
          ? '\nリーダーはほかのメンバーに引き継がれます。'
          : '';
    if (!(await showConfirm(`${label(uid)} さんを「${g.name}」から外しますか？${note}`, { okLabel: '外す', danger: true }))) return;
    void run(async () => {
      await leaveGroup(uid, g.code);
      return `${label(uid)} さんを「${g.name}」から外しました`;
    });
  };

  const personText = (p: Person | undefined, uid: string) => (
    <span className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-2">
      <span className="text-xs font-bold text-white break-all">{p?.name || <span className="text-neutral-500">（名前未設定）</span>}</span>
      <span className="text-[10px] font-mono text-neutral-400 break-all">{p?.participantId || uid}</span>
    </span>
  );

  return (
    <div className="bg-black rounded-3xl p-6 border border-neutral-800 space-y-4 shadow-xl">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <UsersRound size={18} className="text-sky-400" /> グループ（{groups.length}個）
        </h2>
        <button
          onClick={() => {
            setMessage(null);
            void load();
          }}
          disabled={loading}
          className="p-2 rounded-xl text-sky-400 hover:bg-sky-500/10 disabled:opacity-40"
          aria-label="更新"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      <p className="text-[11px] text-neutral-400 leading-relaxed">
        参加者が作ったグループです。グループを開くと、参加者を選んで追加できます（本人の承認は要りません）。1グループ {MAX_GROUP_MEMBERS} 人までです。
      </p>
      {message && (
        <p role="status" className={`text-[11px] font-bold ${message.ok ? 'text-emerald-300' : 'text-red-400'}`}>
          {message.text}
        </p>
      )}

      {groups.length === 0 && <p className="py-4 text-center text-xs text-neutral-500">{loading ? '読み込み中...' : 'グループはまだありません'}</p>}

      {groups.map((g) => {
        const open = openCode === g.code;
        const room = MAX_GROUP_MEMBERS - g.members.length;
        const word = search.trim().toLowerCase();
        const candidates = people.filter(
          (p) =>
            !g.members.includes(p.uid) &&
            (!word || [p.name, p.participantId, p.uid].some((t) => t.toLowerCase().includes(word)))
        );
        return (
          <div key={g.code} className="rounded-2xl bg-neutral-900 border border-neutral-800">
            <button onClick={() => toggle(g.code)} aria-expanded={open} className="w-full flex items-center gap-3 p-3 text-left">
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-white truncate">{g.name}</span>
                <span className="block text-[11px] text-neutral-400">
                  {g.members.length}人・リーダー {label(g.owner)}・招待コード <span className="font-mono select-all">{g.code}</span>
                </span>
              </span>
              <ChevronDown size={16} className={`shrink-0 text-neutral-400 transition ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
              <div className="px-3 pb-3 space-y-4">
                <div className="space-y-1">
                  <p className="text-[11px] font-bold text-neutral-400">メンバー</p>
                  {g.members.map((uid) => (
                    <div key={uid} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black border border-neutral-800">
                      {personText(byUid.get(uid), uid)}
                      {uid === g.owner && <Crown size={13} className="shrink-0 text-amber-300" aria-label="リーダー" />}
                      <button
                        onClick={() => void onRemove(g, uid)}
                        disabled={busy || loading}
                        className="shrink-0 p-1.5 rounded-lg text-neutral-500 hover:text-red-400 disabled:opacity-40"
                        aria-label={`${label(uid)} さんを外す`}
                      >
                        <UserMinus size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-neutral-400">参加者を追加（あと {Math.max(0, room)} 人）</p>
                  <label className="flex items-center gap-2 px-3 bg-black border border-neutral-700 rounded-xl focus-within:border-sky-500">
                    <Search size={13} className="shrink-0 text-neutral-500" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="名前・参加者ID・アカウントIDで探す"
                      autoComplete="off"
                      className="flex-1 min-w-0 py-2 bg-transparent text-xs text-white focus:outline-none"
                    />
                  </label>
                  <div className="max-h-60 overflow-y-auto rounded-xl border border-neutral-800 divide-y divide-neutral-800">
                    {candidates.length === 0 && <p className="py-4 text-center text-xs text-neutral-500">追加できる人はいません</p>}
                    {candidates.map((p) => {
                      const on = picked.includes(p.uid);
                      return (
                        <label key={p.uid} className={`flex items-center gap-3 px-3 py-2 ${on ? 'bg-sky-500/10' : 'bg-black'}`}>
                          <input
                            type="checkbox"
                            className="w-4 h-4 shrink-0 accent-sky-500"
                            checked={on}
                            disabled={busy || loading || (!on && picked.length >= room)}
                            onChange={() => setPicked(on ? picked.filter((x) => x !== p.uid) : [...picked, p.uid])}
                          />
                          {personText(p, p.uid)}
                        </label>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => void onAdd(g)}
                    disabled={busy || loading || picked.length === 0}
                    className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold disabled:opacity-40"
                  >
                    <UserPlus size={14} /> {picked.length > 0 ? `選んだ ${picked.length} 人を追加` : '追加する人を選んでください'}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default AdminGroupsPanel;
