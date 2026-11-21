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

const VOLUME = 0.6;
let audio: HTMLAudioElement | null = null;

const getAudio = () => {
  if (!audio) {
    audio = new Audio();
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = VOLUME;
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
