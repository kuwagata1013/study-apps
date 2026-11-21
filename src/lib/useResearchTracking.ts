// 画面（タブ）と BGM 再生状態の変化を行動データとして記録するフック
import { useEffect, useRef } from 'react';
import { setEventScreen, trackEvent } from './researchEvents';

export const useScreenTracking = (screen: string) => {
  useEffect(() => {
    setEventScreen(screen);
  }, [screen]);
};

// 再生開始・停止・再生中の曲変更を記録し、停止時に再生していた秒数を残す
export const useBgmTracking = (isPlaying: boolean, track: string) => {
  const current = useRef<{ track: string; since: number } | null>(null);

  useEffect(() => {
    const now = Date.now();
    const playing = current.current;
    if (playing && (!isPlaying || playing.track !== track)) {
      trackEvent('bgm_stop', { label: playing.track, seconds: (now - playing.since) / 1000 });
      current.current = null;
    }
    if (isPlaying && !current.current) {
      trackEvent('bgm_play', { label: track });
      current.current = { track, since: now };
    }
  }, [isPlaying, track]);

  // 再生したまま画面を離れた場合
  useEffect(
    () => () => {
      const playing = current.current;
      if (playing) {
        trackEvent('bgm_stop', { label: playing.track, seconds: (Date.now() - playing.since) / 1000 });
        current.current = null;
      }
    },
    []
  );
};
