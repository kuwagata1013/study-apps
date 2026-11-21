// BGM 再生中を表すイコライザー（見た目は index.css の .bgm-eq。色は CSS 変数 --eq-color で変えられる）
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
