// BGM の再生（アプリに同梱した MP3 をループ再生する）
// 曲は scripts/make_bgm.cjs で合成したオリジナル音源（著作権の心配なし）
import rain from '../assets/bgm/rain.mp3';
import deepRain from '../assets/bgm/deep_rain.mp3';
import waves from '../assets/bgm/waves.mp3';
import cafe from '../assets/bgm/cafe.mp3';
import lofi from '../assets/bgm/lofi.mp3';
import cyber from '../assets/bgm/cyber.mp3';

export const BGM_SOURCES = {
  rain,
  deep_rain: deepRain,
  waves,
  cafe,
  lofi,
  cyber
} as const;

export type BgmId = keyof typeof BGM_SOURCES;

// 音量（0〜1）。端末に覚えておく
const VOLUME_KEY = 'bgm_volume';
const DEFAULT_VOLUME = 0.6;
let ducked = false; // タイマーの音が鳴っている間は BGM を小さくする
let audio: HTMLAudioElement | null = null;

export const getBgmVolume = (): number => {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return localStorage.getItem(VOLUME_KEY) !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
};

export const setBgmVolume = (v: number) => {
  const vol = Math.min(1, Math.max(0, v));
  if (audio) audio.volume = ducked ? vol * 0.2 : vol;
  try {
    localStorage.setItem(VOLUME_KEY, String(vol));
  } catch {
    // 無視
  }
};

export const duckBgm = (on: boolean) => {
  ducked = on;
  if (audio) audio.volume = getBgmVolume() * (on ? 0.2 : 1);
};

const getAudio = () => {
  if (!audio) {
    audio = new Audio();
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = getBgmVolume() * (ducked ? 0.2 : 1);
  }
  return audio;
};

// ボタンを押した処理の中で直接呼ぶこと（スマホは操作の直後でないと再生できない）
// 再生できたら true
export const playBgm = async (id: BgmId): Promise<boolean> => {
  const a = getAudio();
  if (a.dataset.track !== id) {
    a.src = BGM_SOURCES[id];
    a.dataset.track = id;
  }
  try {
    await a.play();
    return true;
  } catch (e) {
    console.error('BGMの再生に失敗しました:', e);
    return false;
  }
};

export const stopBgm = () => {
  audio?.pause();
};
