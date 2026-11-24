import React, { useState } from 'react';
import { Bell } from 'lucide-react';
import DialogFrame, { DIALOG_STYLES } from './DialogFrame';
import { enableNotify, notifySupported, setAlarmSettings, stopAlarm, testAlarm, testNotify, useAlarmSettings } from '../lib/timerAlarm';

// 減算タイマーの音と通知の設定（開くボタンとポップアップ。両モード共通）
const AlarmSettings: React.FC<{ theme: 'game' | 'light' }> = ({ theme }) => {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const v = useAlarmSettings();
  const s = DIALOG_STYLES[theme];
  const supported = notifySupported();
  const notifyOn = supported && v.notify && Notification.permission === 'granted';
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const close = () => {
    stopAlarm();
    setNote('');
    setOpen(false);
  };
  const toggleNotify = async (on: boolean) => {
    setNote('');
    if (!on) return setAlarmSettings({ notify: false });
    if (!(await enableNotify())) setNote('通知が許可されていません。ブラウザや端末の設定で、このサイトの通知を許可してください。');
  };
  const row = 'flex items-center justify-between gap-3 text-sm font-bold';
  const small = `px-3 py-2 text-xs font-bold disabled:opacity-40 ${s.cancel}`;
  const accent = theme === 'game' ? 'accent-[#fdd69f]' : 'accent-gray-900';
  const box = `w-5 h-5 shrink-0 ${accent}`;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`mx-auto flex items-center gap-1 px-2 py-1 text-[11px] font-bold ${theme === 'game' ? 'text-[#fdd69f]/80 hover:text-[#fdd69f]' : 'text-gray-500 hover:text-gray-800'}`}
      >
        <Bell size={13} /> 音と通知の設定
      </button>
      {open && (
        <DialogFrame theme={theme} labelledBy="alarm-settings-title" wide onCancel={close}>
          <h2 id="alarm-settings-title" className="text-base font-black">
            タイマー終了の音と通知
          </h2>
          <div className="mt-4 space-y-3 text-left">
            <div className={`p-4 space-y-3 ${s.box}`}>
              <label className={row}>
                音を鳴らす
                <input type="checkbox" className={box} checked={v.sound} onChange={(e) => setAlarmSettings({ sound: e.target.checked })} />
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={5}
                  max={100}
                  aria-label="音の大きさ"
                  className={`flex-1 min-w-0 ${accent}`}
                  disabled={!v.sound}
                  value={Math.round(v.volume * 100)}
                  onChange={(e) => setAlarmSettings({ volume: Number(e.target.value) / 100 })}
                />
                <button className={small} disabled={!v.sound} onClick={testAlarm}>
                  音を試す
                </button>
              </div>
            </div>
            <div className={`p-4 space-y-3 ${s.box}`}>
              <label className={row}>
                通知を出す
                <input type="checkbox" className={box} checked={notifyOn} disabled={!supported} onChange={(e) => void toggleNotify(e.target.checked)} />
              </label>
              <p className={`text-xs ${s.sub}`}>
                {supported
                  ? 'ほかのタブやアプリを見ているときに、終わったことを通知します。'
                  : isIos
                    ? 'iPhone・iPad では、共有ボタンから「ホーム画面に追加」して、そこから開くと使えます。'
                    : 'このブラウザや開き方では通知を使えません。'}
              </p>
              {notifyOn && (
                <button className={small} onClick={async () => setNote((await testNotify()) ? '' : '通知を出せませんでした。')}>
                  通知を試す
                </button>
              )}
              {note && (
                <p role="alert" className="text-xs font-bold">
                  {note}
                </p>
              )}
            </div>
            <div className={`p-4 space-y-2 ${s.box}`}>
              <label className={row}>
                減算中は画面を消さない
                <input type="checkbox" className={box} checked={v.keepAwake} onChange={(e) => setAlarmSettings({ keepAwake: e.target.checked })} />
              </label>
              <p className={`text-xs ${s.sub}`}>
                スマホは、画面を消したりほかのアプリを開いたりすると、音も通知も届かないことがあります。この画面を開いたままにしてください。
              </p>
            </div>
          </div>
          <button data-autofocus onClick={close} className={`mt-5 w-full py-3 text-sm font-black transition active:scale-95 ${s.ok}`}>
            閉じる
          </button>
        </DialogFrame>
      )}
    </>
  );
};

export default AlarmSettings;
