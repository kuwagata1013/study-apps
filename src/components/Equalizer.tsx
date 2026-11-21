// BGM 再生中を表すイコライザー（見た目は GameStage.css の .bgm-eq）
import React from 'react';

const Equalizer: React.FC<{ playing: boolean; className?: string }> = ({ playing, className = '' }) => (
  <span className={`bgm-eq ${playing ? 'is-playing' : ''} ${className}`} aria-hidden="true">
    <span />
    <span />
    <span />
    <span />
  </span>
);

export default Equalizer;
