// 管理者用：ゲーム版デイリークエストの設定（1日に出す数・クリアボーナス・候補の追加と削除）
// 保存するとすぐに反映される（次にアプリを開いた人から新しい設定になる）
import React, { useEffect, useMemo, useState } from 'react';
import { ListChecks, Plus, RefreshCw, RotateCcw, Save, Trash2 } from 'lucide-react';
import {
  DEFAULT_QUEST_CONFIG,
  EXP_MAX,
  PER_DAY_MAX,
  PER_DAY_MIN,
  POOL_MAX,
  QUEST_KIND_INFO,
  QUEST_KINDS,
  QUEST_SUBJECTS,
  fetchQuestConfig,
  saveQuestConfig,
  type QuestConfig,
  type QuestKind,
  type QuestSubject,
  type QuestTemplate
} from '../../lib/questConfig';
import { describeQuest, questsFor } from '../gamified/dailyQuests';

const inputCls =
  'w-full px-2.5 py-2 text-xs border border-neutral-700 rounded-lg bg-black text-neutral-100 focus:outline-none focus:ring-2 focus:ring-sky-500';

const newId = () => `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const templateTitle = (t: QuestTemplate) =>
  describeQuest(t.kind, t.target, t.kind === 'subject' ? (t.subject === 'random' || !t.subject ? '（日替わりの教科）' : t.subject) : '').title;

const sameConfig = (a: QuestConfig, b: QuestConfig) => JSON.stringify(a) === JSON.stringify(b);

export const QuestSettingsPanel: React.FC = () => {
  const [saved, setSaved] = useState<QuestConfig | null>(null);
  const [draft, setDraft] = useState<QuestConfig>(DEFAULT_QUEST_CONFIG);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const c = await fetchQuestConfig();
      setSaved(c);
      setDraft(c);
    } catch (e) {
      console.error('クエスト設定の読み込みに失敗:', e);
      setError('読み込めませんでした。通信状態を確認してください');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const dirty = saved !== null && !sameConfig(saved, draft);
  const perDayOver = draft.perDay > draft.pool.length;

  // 今日と、この先6日に出るクエスト（今の下書きで）
  const preview = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return d;
    });
    return days.map((d) => ({ date: d, quests: draft.pool.length > 0 ? questsFor(d, { ...draft, perDay: Math.min(draft.perDay, draft.pool.length) }) : [] }));
  }, [draft]);

  const updateTemplate = (id: string, patch: Partial<QuestTemplate>) =>
    setDraft((c) => ({ ...c, pool: c.pool.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));

  const changeKind = (id: string, kind: QuestKind) => {
    const info = QUEST_KIND_INFO[kind];
    setDraft((c) => ({
      ...c,
      pool: c.pool.map((t) => {
        if (t.id !== id) return t;
        const target = Math.min(info.max, Math.max(info.min, t.target));
        const next: QuestTemplate = { id: t.id, kind, target, exp: t.exp };
        if (kind === 'subject') next.subject = 'random';
        return next;
      })
    }));
  };

  const addTemplate = () =>
    setDraft((c) => (c.pool.length >= POOL_MAX ? c : { ...c, pool: [...c.pool, { id: newId(), kind: 'total', target: 30, exp: 100 }] }));

  const removeTemplate = (id: string) => setDraft((c) => ({ ...c, pool: c.pool.filter((t) => t.id !== id) }));

  const handleSave = async () => {
    if (draft.pool.length === 0) {
      alert('クエストの候補を1つ以上入れてください');
      return;
    }
    if (perDayOver) {
      alert(`1日に出す数（${draft.perDay}）が候補の数（${draft.pool.length}）より多いです`);
      return;
    }
    if (
      !confirm(
        'クエストの設定を保存しますか？\n\n・すぐに反映されます（次にアプリを開いた人から、新しい設定のクエストになります）\n・今日のクエストが入れ替わることがあります\n・研究の条件が変わるので、変えた日時を記録しておくことをおすすめします'
      )
    )
      return;
    setSaving(true);
    try {
      const clean = await saveQuestConfig(draft);
      setSaved(clean);
      setDraft(clean);
      alert('保存しました');
    } catch (e) {
      console.error('クエスト設定の保存に失敗:', e);
      alert('保存できませんでした。管理者アカウントでログインしているか、Firestore のルールがデプロイされているか確認してください');
    } finally {
      setSaving(false);
    }
  };

  const dateText = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}）`;

  return (
    <div className="space-y-6">
      <div className="bg-black rounded-3xl p-6 border border-neutral-800 space-y-5 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <ListChecks size={18} className="text-sky-400" /> デイリークエストの設定（ゲーム版）
          </h2>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="p-2 rounded-xl text-sky-400 hover:bg-sky-500/10 disabled:opacity-40"
            aria-label="読み込み直す"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <p className="text-[11px] text-neutral-400 leading-relaxed">
          下の候補の中から、毎日決まった数のクエストを全員に同じように出します（日付で決まります）。保存するとすぐに反映されます。
        </p>
        {error && <p className="text-[11px] font-bold text-red-400">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-[11px] font-bold text-neutral-300">1日に出す数</span>
            <select
              value={draft.perDay}
              onChange={(e) => setDraft((c) => ({ ...c, perDay: Number(e.target.value) }))}
              className={inputCls}
            >
              {Array.from({ length: PER_DAY_MAX - PER_DAY_MIN + 1 }, (_, i) => PER_DAY_MIN + i).map((n) => (
                <option key={n} value={n}>
                  {n} 個
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-bold text-neutral-300">クリアボーナス（EXP）</span>
            <input
              type="number"
              min={0}
              max={EXP_MAX}
              value={draft.allClearExp}
              onChange={(e) => setDraft((c) => ({ ...c, allClearExp: Math.max(0, Math.min(EXP_MAX, Math.round(Number(e.target.value) || 0))) }))}
              className={inputCls}
            />
          </label>
        </div>
        {perDayOver && (
          <p className="text-[11px] font-bold text-amber-300">
            ⚠ 1日に出す数（{draft.perDay}）が候補の数（{draft.pool.length}）より多いです。候補を増やすか、数を減らしてください
          </p>
        )}

        {/* 候補 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-neutral-300">
              クエストの候補（{draft.pool.length} / {POOL_MAX}）
            </span>
            <button
              onClick={addTemplate}
              disabled={draft.pool.length >= POOL_MAX}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold disabled:opacity-40"
            >
              <Plus size={13} /> 候補を追加
            </button>
          </div>

          {draft.pool.map((t) => {
            const info = QUEST_KIND_INFO[t.kind];
            return (
              <div key={t.id} className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-white truncate">{templateTitle(t)}</p>
                  <button
                    onClick={() => removeTemplate(t.id)}
                    className="shrink-0 p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10"
                    aria-label="この候補を削除"
                    title="削除"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className={`grid gap-2 ${t.kind === 'subject' ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
                  <label className="block space-y-0.5">
                    <span className="text-[10px] text-neutral-500">種類</span>
                    <select value={t.kind} onChange={(e) => changeKind(t.id, e.target.value as QuestKind)} className={inputCls}>
                      {QUEST_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {QUEST_KIND_INFO[k].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {t.kind === 'subject' && (
                    <label className="block space-y-0.5">
                      <span className="text-[10px] text-neutral-500">教科</span>
                      <select
                        value={t.subject ?? 'random'}
                        onChange={(e) => updateTemplate(t.id, { subject: e.target.value as QuestSubject })}
                        className={inputCls}
                      >
                        <option value="random">日替わり</option>
                        {QUEST_SUBJECTS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="block space-y-0.5">
                    <span className="text-[10px] text-neutral-500">
                      目標（{info.unit}・{info.min}〜{info.max}）
                    </span>
                    <input
                      type="number"
                      min={info.min}
                      max={info.max}
                      value={t.target}
                      onChange={(e) =>
                        updateTemplate(t.id, { target: Math.max(info.min, Math.min(info.max, Math.round(Number(e.target.value) || info.min))) })
                      }
                      className={inputCls}
                    />
                  </label>
                  <label className="block space-y-0.5">
                    <span className="text-[10px] text-neutral-500">報酬（EXP）</span>
                    <input
                      type="number"
                      min={0}
                      max={EXP_MAX}
                      value={t.exp}
                      onChange={(e) => updateTemplate(t.id, { exp: Math.max(0, Math.min(EXP_MAX, Math.round(Number(e.target.value) || 0))) })}
                      className={inputCls}
                    />
                  </label>
                </div>
              </div>
            );
          })}
          {draft.pool.length === 0 && <p className="text-[11px] text-neutral-500">候補がありません。「候補を追加」から入れてください</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            onClick={() => void handleSave()}
            disabled={saving || !dirty || draft.pool.length === 0 || perDayOver}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold disabled:opacity-40"
          >
            <Save size={14} /> {saving ? '保存中...' : '保存してすぐ反映'}
          </button>
          <button
            onClick={() => saved && setDraft(saved)}
            disabled={!dirty}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-neutral-700 text-neutral-300 text-xs font-bold hover:bg-neutral-800 disabled:opacity-40"
          >
            変更を取り消す
          </button>
          <button
            onClick={() => confirm('初期設定（1日3個・12個の候補・クリアボーナス100）を下書きに入れますか？（保存するまで反映されません）') && setDraft(DEFAULT_QUEST_CONFIG)}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-neutral-700 text-neutral-400 text-xs font-bold hover:bg-neutral-800"
          >
            <RotateCcw size={13} /> 初期設定に戻す
          </button>
          {dirty && <span className="text-[11px] font-bold text-amber-300">保存していない変更があります</span>}
        </div>
      </div>

      {/* 見本 */}
      <div className="bg-black rounded-3xl p-6 border border-neutral-800 space-y-3 shadow-xl">
        <h3 className="text-xs font-bold text-white">出るクエストの見本（今の下書きで・今日から7日分）</h3>
        <div className="space-y-2">
          {preview.map(({ date, quests }, i) => (
            <div key={i} className="flex gap-3 text-[11px]">
              <span className={`w-16 shrink-0 font-bold ${i === 0 ? 'text-sky-300' : 'text-neutral-400'}`}>
                {i === 0 ? '今日' : dateText(date)}
              </span>
              <span className="text-neutral-200 leading-relaxed">
                {quests.map((q) => `${q.title}（${q.exp}）`).join('　/　') || '—'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default QuestSettingsPanel;
