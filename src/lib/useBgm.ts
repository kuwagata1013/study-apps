// BGM の選択・再生・停止をまとめたフック（行動データの記録も行う）
import { useEffect, useState } from 'react';
import { playBgm, stopBgm, type BgmId } from './bgm';
import { trackEvent } from './researchEvents';
import { useBgmTracking } from './useResearchTracking';

export const useBgm = <T extends string>(initial: T, sources: Record<T, BgmId>) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [track, setTrack] = useState<T>(initial);

  useBgmTracking(isPlaying, track);

  // 画面を離れたら止める
  useEffect(() => () => stopBgm(), []);

  const start = (id: T) => {
    setIsPlaying(true);
    playBgm(sources[id]).then((ok) => {
      if (!ok) {
        setIsPlaying(false);
        alert('BGMを再生できませんでした。端末の音量やマナーモードを確認して、もう一度お試しください。');
      }
    });
  };

  const toggle = () => {
    if (isPlaying) {
      stopBgm();
      setIsPlaying(false);
    } else {
      start(track);
    }
  };

  const select = (id: T) => {
    if (id === track) return;
    trackEvent('bgm_select', { label: id });
    setTrack(id);
    if (isPlaying) start(id);
  };

  return { isPlaying, track, toggle, select };
};
