// 減算タイマーが終わったときのお知らせ（音・振動・通知）。両モード共通
import { useEffect, useSyncExternalStore } from 'react';
import { duckBgm } from './bgm';

// ===== 設定（端末に覚えておく） =====
export interface AlarmSettings {
  sound: boolean;
  volume: number; // 0〜1
  notify: boolean; // 別のタブやアプリを見ているときに通知する
  keepAwake: boolean; // 減算の計測中は画面を消さない
}
const KEY = 'timer_alarm_settings';
const DEFAULTS: AlarmSettings = { sound: true, volume: 0.8, notify: false, keepAwake: true };
const load = (): AlarmSettings => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    const bool = (k: 'sound' | 'notify' | 'keepAwake') => (typeof v[k] === 'boolean' ? v[k] : DEFAULTS[k]);
    const volume = typeof v.volume === 'number' ? Math.min(1, Math.max(0, v.volume)) : DEFAULTS.volume;
    return { sound: bool('sound'), volume, notify: bool('notify'), keepAwake: bool('keepAwake') };
  } catch {
    return DEFAULTS;
  }
};
let settings = load();
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const getAlarmSettings = () => settings;
export const setAlarmSettings = (next: Partial<AlarmSettings>) => {
  settings = { ...settings, ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 無視
  }
  if (master) master.gain.value = settings.volume;
  listeners.forEach((l) => l());
};
export const useAlarmSettings = () => useSyncExternalStore(subscribe, getAlarmSettings);

// ===== 音 =====
const RING_MS = 30000; // OK を押さなくても、これだけ鳴ったら止める
const PATTERN_SECONDS = 1.6; // 「ピピピピッ」1回分
let ctx: AudioContext | null = null;
let master: GainNode | null = null; // 鳴っている間だけある
let stopTimer: ReturnType<typeof setTimeout> | undefined;
let vibrateTimer: ReturnType<typeof setInterval> | undefined;

// iPhone の消音スイッチが入っていても鳴るようにする（対応している端末だけ）
const setAudioSession = (type: 'playback' | 'auto') => {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  try {
    if (session) session.type = type;
  } catch {
    // 無視
  }
};

// 開始ボタンなど、押した処理の中で呼ぶ（操作の直後でないと音を出す許可がもらえない）
export const prepareAlarm = () => {
  try {
    ctx ??= new AudioContext();
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
  } catch (e) {
    console.error('音の準備に失敗しました:', e);
  }
};

const schedule = (c: AudioContext, out: GainNode, seconds: number) => {
  const beep = (at: number, freq: number) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.35, at + 0.01);
    gain.gain.setValueAtTime(0.35, at + 0.12);
    gain.gain.linearRampToValueAtTime(0, at + 0.16);
    osc.connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + 0.18);
  };
  const start = c.currentTime + 0.05;
  for (let t = 0; t < seconds; t += PATTERN_SECONDS) {
    [0, 0.2, 0.4, 0.6].forEach((d, i) => beep(start + t + d, i % 2 ? 1319 : 1047));
  }
};

// まだ音を出せない状態（iPhone で別アプリから戻った直後など）なら、次に触ったときに鳴らす
const retry = () => {
  if (master && ctx && ctx.state !== 'running') void ctx.resume().catch(() => {});
};

const ring = (ms: number) => {
  stopSound();
  if (!settings.sound) return;
  setAudioSession('playback');
  prepareAlarm();
  if (!ctx) return;
  duckBgm(true);
  master = ctx.createGain();
  master.gain.value = settings.volume;
  master.connect(ctx.destination);
  schedule(ctx, master, ms / 1000);
  document.addEventListener('pointerdown', retry);
  document.addEventListener('visibilitychange', retry);
  stopTimer = setTimeout(stopSound, ms);
};

const stopSound = () => {
  clearTimeout(stopTimer);
  if (!master) return;
  master.disconnect();
  master = null;
  duckBgm(false);
  setAudioSession('auto');
  document.removeEventListener('pointerdown', retry);
  document.removeEventListener('visibilitychange', retry);
};

// 音・振動・通知をすべて止める（OK を押したとき）
export const stopAlarm = () => {
  stopSound();
  clearInterval(vibrateTimer);
  if (vibrateTimer !== undefined) navigator.vibrate?.(0);
  vibrateTimer = undefined;
  closeNotification();
};

// 設定画面の「音を試す」
export const testAlarm = () => ring(PATTERN_SECONDS * 1000);

// ===== 通知 =====
const TAG = 'timer-finish';
let shown: Notification | null = null;
let showing = 0; // 出す途中で止められたら出さない

export const notifySupported = () => 'Notification' in window && window.isSecureContext;

// スマホの Chrome は Service Worker からしか通知を出せない
const registration = async () => {
  if (!('serviceWorker' in navigator) || import.meta.env.MODE === 'offline') return null;
  try {
    await navigator.serviceWorker.register('/sw.js');
    return await navigator.serviceWorker.ready;
  } catch (e) {
    console.error('通知の準備に失敗しました:', e);
    return null;
  }
};

const showNotification = async (title: string, body: string) => {
  if (!notifySupported() || Notification.permission !== 'granted') return false;
  const id = ++showing;
  const reg = await registration();
  if (id !== showing) return false;
  const options: NotificationOptions = { body, tag: TAG, icon: '/favicon.svg', requireInteraction: true };
  try {
    if (reg) {
      await reg.showNotification(title, options);
    } else {
      shown = new Notification(title, options);
      shown.onclick = () => {
        window.focus();
        shown?.close();
      };
    }
    return true;
  } catch (e) {
    console.error('通知を出せませんでした:', e);
    return false;
  }
};

const closeNotification = () => {
  showing++;
  shown?.close();
  shown = null;
  if (!('serviceWorker' in navigator) || import.meta.env.MODE === 'offline') return;
  navigator.serviceWorker
    .getRegistration()
    .then((reg) => reg?.getNotifications({ tag: TAG }))
    .then((list) => list?.forEach((n) => n.close()))
    .catch(() => {});
};

// 通知をオンにする（ボタンを押した処理の中で呼ぶ）。許可されたら true
export const enableNotify = async () => {
  if (!notifySupported()) return false;
  try {
    const ok = (await Notification.requestPermission()) === 'granted';
    if (ok) void registration();
    setAlarmSettings({ notify: ok });
    return ok;
  } catch {
    return false;
  }
};

export const testNotify = () => showNotification('通知のテスト', 'タイマーが終わると、このように届きます。');

// ===== タイマーが終わったとき =====
export const fireAlarm = (subject: string, minutes: number) => {
  stopAlarm();
  ring(RING_MS);
  // 振動（Android）。音と同じ長さだけ続ける
  if (settings.sound) {
    const vibrate = () => navigator.vibrate?.([400, 200, 400]);
    const started = Date.now();
    vibrate();
    vibrateTimer = setInterval(() => {
      if (Date.now() - started < RING_MS) {
        vibrate();
      } else {
        clearInterval(vibrateTimer);
        vibrateTimer = undefined;
      }
    }, 2000);
  }
  if (settings.notify && (document.hidden || !document.hasFocus())) {
    void showNotification('設定時間が経過しました！', `${subject}　${minutes}分`);
  }
};

// ===== 画面を消さない =====
export const useKeepAwake = (active: boolean) => {
  const on = useAlarmSettings().keepAwake && active;
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let ended = false;
    const request = async () => {
      if (ended || document.hidden || (lock && !lock.released)) return;
      try {
        const got = await navigator.wakeLock.request('screen');
        if (ended) void got.release();
        else lock = got;
      } catch {
        // 省電力モードなどで断られたときは何もしない
      }
    };
    void request();
    document.addEventListener('visibilitychange', request);
    return () => {
      ended = true;
      document.removeEventListener('visibilitychange', request);
      void lock?.release();
    };
  }, [on]);
};
