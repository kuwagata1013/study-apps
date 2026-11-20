// オフライン版用の環境音。音源ファイルをダウンロードせず、その場で WAV を合成する
// URL が "offline:rain" などのときだけ使う（オンライン版の URL はそのまま返す）
export const OFFLINE_SOUND_PREFIX = 'offline:';

type Kind = 'rain' | 'waves' | 'cafe';

const RATE = 22050;
const SECONDS = 12;
const cache = new Map<string, string>();

const synth = (kind: Kind): Float32Array => {
  const n = RATE * SECONDS;
  const out = new Float32Array(n);
  let seed = kind === 'rain' ? 1 : kind === 'waves' ? 2 : 3;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296 - 0.5;
  };
  let lp = 0;
  let brown = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const white = rand();
    if (kind === 'rain') {
      lp += (white - lp) * 0.35;
      // ときどき大きめの雨粒
      const drop = rand() > 0.4985 ? rand() * 1.6 : 0;
      out[i] = lp * 0.55 + drop;
    } else if (kind === 'waves') {
      brown = (brown + white * 0.06) * 0.996;
      // 約 6 秒周期でうねる（12 秒でちょうど 2 周してループがつながる）
      const swell = 0.25 + 0.75 * Math.pow(Math.sin((Math.PI * t) / 6), 2);
      out[i] = brown * swell * 2.2;
    } else {
      brown = (brown + white * 0.04) * 0.995;
      lp += (white - lp) * 0.08;
      let v = brown * 1.6 + lp * 0.25;
      // 食器の音（短い高音）
      const phase = (t * 0.7) % 1;
      if (phase < 0.03) v += Math.sin(2 * Math.PI * 2400 * t) * (1 - phase / 0.03) * 0.12;
      out[i] = v;
    }
  }
  // 端をなめらかにつなぐ
  const fade = RATE / 20;
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    out[i] = out[i] * k + out[n - fade + i] * (1 - k);
  }
  return out.subarray(0, n - fade);
};

const toWavUrl = (samples: Float32Array): string => {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
};

export const resolveSoundUrl = (url: string): string => {
  if (!url.startsWith(OFFLINE_SOUND_PREFIX)) return url;
  const kind = url.slice(OFFLINE_SOUND_PREFIX.length) as Kind;
  if (!cache.has(kind)) cache.set(kind, toWavUrl(synth(kind)));
  return cache.get(kind) as string;
};
