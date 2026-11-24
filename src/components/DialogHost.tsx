import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { ClipboardCheck, Flame, Gem, Gift, Sparkles, Trophy } from 'lucide-react';
import { closeDialog, getDialogState, subscribeDialogs, type DialogEntry, type DialogIcon, type DialogTheme } from '../lib/dialog';
import DialogFrame, { DIALOG_STYLES } from './DialogFrame';

const ICONS: Record<DialogIcon, typeof Gift> = {
  gift: Gift,
  gem: Gem,
  flame: Flame,
  trophy: Trophy,
  level: Sparkles,
  record: ClipboardCheck
};

// 演出（紙ふぶきなど）を出し終えたポップアップ。開発時に2回呼ばれても1回だけにする
const shown = new Set<number>();

const DialogView: React.FC<{ entry: DialogEntry; theme: DialogTheme }> = ({ entry, theme }) => {
  const s = DIALOG_STYLES[theme];
  const [value, setValue] = useState(entry.defaultValue ?? '');
  const Icon = entry.icon ? ICONS[entry.icon] : null;
  const cancel = () => closeDialog(entry.id, null);
  const isLong = !!entry.message?.includes('\n・');

  useEffect(() => {
    if (shown.has(entry.id)) return;
    shown.add(entry.id);
    entry.onShow?.();
  }, [entry]);

  return (
    <DialogFrame theme={theme} labelledBy="app-dialog-text" wide={isLong || !!entry.rows} onCancel={cancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          closeDialog(entry.id, value);
        }}
      >
        {Icon && (
          <div className={`w-14 h-14 mx-auto mb-3 rounded-full flex items-center justify-center ${s.icon}`}>
            <Icon size={28} />
          </div>
        )}
        <div id="app-dialog-text">
          {entry.title && <h2 className="text-base font-black">{entry.title}</h2>}
          {entry.message && (
            <p
              className={`whitespace-pre-line break-words text-sm font-bold leading-relaxed ${entry.title ? 'mt-2' : ''} ${isLong ? 'text-left' : 'text-balance [word-break:auto-phrase]'}`}
            >
              {entry.message}
            </p>
          )}
        </div>
        {entry.rows && (
          <div className={`mt-4 p-4 space-y-2 text-left ${s.box}`}>
            {entry.rows.map((r, i) => (
              <div key={i} className="flex justify-between gap-3 text-xs font-bold">
                <span className={`min-w-0 ${s.sub}`}>{r.label}</span>
                <span className="shrink-0">{r.value}</span>
              </div>
            ))}
            {entry.total && (
              <div className={`flex justify-between items-baseline gap-3 pt-2 border-t border-current/20 font-black ${s.accent}`}>
                <span className="text-sm">{entry.total.label}</span>
                <span className="text-xl">{entry.total.value}</span>
              </div>
            )}
          </div>
        )}
        {entry.kind === 'prompt' && (
          <input
            data-autofocus
            aria-labelledby="app-dialog-text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={`mt-4 w-full px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-current/30 ${s.input}`}
          />
        )}
        <div className="mt-5 flex gap-2">
          {entry.kind !== 'alert' && (
            <button type="button" onClick={cancel} className={`flex-1 py-3 text-sm font-bold transition active:scale-95 ${s.cancel}`}>
              キャンセル
            </button>
          )}
          <button
            type="submit"
            data-autofocus={entry.kind === 'prompt' ? undefined : true}
            className={`flex-1 py-3 text-sm font-black transition active:scale-95 ${entry.danger ? s.danger : s.ok}`}
          >
            {entry.okLabel ?? 'OK'}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
};

// 順番待ちの先頭のポップアップを出す（main.tsx で1つだけ置く）
const DialogHost: React.FC = () => {
  const { queue, theme } = useSyncExternalStore(subscribeDialogs, getDialogState);
  const entry = queue[0];
  return entry ? <DialogView key={entry.id} entry={entry} theme={theme} /> : null;
};

export default DialogHost;
