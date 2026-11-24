import React from 'react';
import { Timer } from 'lucide-react';
import { stopAlarm } from '../lib/timerAlarm';
import DialogFrame, { DIALOG_STYLES } from './DialogFrame';

// 減算タイマーが終わったときのポップアップ（文言は両モード共通。見た目だけモードに合わせる）
const TimerFinishDialog: React.FC<{
  theme: 'game' | 'light';
  subject: string;
  minutes: number;
  onClose: () => void;
}> = ({ theme, subject, minutes, onClose }) => {
  const s = DIALOG_STYLES[theme];
  const close = () => {
    stopAlarm();
    onClose();
  };
  return (
    <DialogFrame theme={theme} labelledBy="timer-finish-title" onCancel={close}>
      <div className={`w-14 h-14 mx-auto rounded-full flex items-center justify-center ${s.icon}`}>
        <Timer size={28} />
      </div>
      <h2 id="timer-finish-title" className="mt-3 text-base font-black">
        設定時間が経過しました！
      </h2>
      <div className={`mt-4 py-3 px-4 ${s.box}`}>
        <p className={`text-xs font-bold ${s.sub}`}>{subject}</p>
        <p className={`text-3xl font-black font-mono ${s.accent}`}>
          {minutes}
          <span className="text-sm ml-1">分</span>
        </p>
      </div>
      <button data-autofocus onClick={close} className={`mt-5 w-full py-3 text-sm font-black transition active:scale-95 ${s.ok}`}>
        OK
      </button>
    </DialogFrame>
  );
};

export default TimerFinishDialog;
