// ゲーム版の BGM の曲一覧
import React from 'react';
import { CloudRain, Headphones, Zap } from 'lucide-react';

// 研究条件として、ゲーム版で使う曲はこの3曲のまま
export type BgmTrack = 'cyber' | 'lofi' | 'rain';

export const BGM_TRACKS: { id: BgmTrack; name: string; desc: string; icon: React.ReactNode }[] = [
  { id: 'cyber', name: 'サイバー', desc: '電子音のビートで集中モードへ', icon: <Zap size={20} /> },
  { id: 'lofi', name: 'Lo-Fi', desc: 'ゆったりしたビートで落ち着いて', icon: <Headphones size={20} /> },
  { id: 'rain', name: 'ディープ雨', desc: '雨音でまわりの音をかき消す', icon: <CloudRain size={20} /> }
];

export const bgmName = (id: BgmTrack) => BGM_TRACKS.find((t) => t.id === id)?.name ?? id;
