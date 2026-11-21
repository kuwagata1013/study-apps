// オリジナルの BGM / 環境音を合成して MP3 にする（すべて 60 秒でループがつながる）
// 使い方: 作業用フォルダで npm i lamejs@1.2.1 を入れ、このファイルを置いて node make_bgm.cjs <出力先>
// （例: node make_bgm.cjs ../study-apps/src/assets/bgm）。乱数の種を固定しているので毎回同じ音になる
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'node_modules/lamejs/lame.all.js'), 'utf8') + ';this.L=lamejs;', ctx);
const lame = ctx.L;

const SR = 32000;
const SECONDS = 60;
const N = SR * SECONDS;
const outDir = process.argv[2];

const mulberry = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const buf = () => new Float32Array(N);
const at = (i) => ((i % N) + N) % N;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 1 次ローパス（ループの継ぎ目でも状態がつながるよう 2 周回して 2 周目を使う）
const lowpass = (x, cutoff) => {
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
  const y = new Float32Array(N);
  let s = 0;
  for (let pass = 0; pass < 2; pass++)
    for (let i = 0; i < N; i++) {
      s += a * (x[i] - s);
      if (pass === 1) y[i] = s;
    }
  return y;
};
const highpass = (x, cutoff) => {
  const l = lowpass(x, cutoff);
  return x.map((v, i) => v - l[i]);
};
const mix = (out, x, g = 1) => {
  for (let i = 0; i < N; i++) out[i] += x[i] * g;
};
const noise = (rand) => {
  const x = buf();
  for (let i = 0; i < N; i++) x[i] = rand() * 2 - 1;
  return x;
};
// ゆっくり変化するランダムな揺らぎ（0〜1）。周期 N でつながる
const slowWobble = (rand, pointsPerLoop) => {
  const pts = Array.from({ length: pointsPerLoop }, () => rand());
  const x = buf();
  for (let i = 0; i < N; i++) {
    const p = (i / N) * pointsPerLoop;
    const k = Math.floor(p);
    const f = p - k;
    const a = pts[k % pointsPerLoop];
    const b = pts[(k + 1) % pointsPerLoop];
    const s = (1 - Math.cos(Math.PI * f)) / 2;
    x[i] = a + (b - a) * s;
  }
  return x;
};

// 音を 1 つ鳴らす（ループの終わりをはみ出した分は先頭に回す）
const tone = (out, t0, dur, gen, env, amp) => {
  const start = Math.round(t0 * SR);
  const len = Math.round(dur * SR);
  for (let k = 0; k < len; k++) {
    const t = k / SR;
    out[at(start + k)] += gen(t) * env(t, dur) * amp;
  }
};
const adsr = (a, d, s, r) => (t, dur) => {
  if (t < a) return t / a;
  if (t < a + d) return 1 - ((t - a) / d) * (1 - s);
  if (t < dur - r) return s;
  return Math.max(0, s * (1 - (t - (dur - r)) / r));
};
const expDecay = (tau) => (t) => Math.exp(-t / tau) * Math.min(1, t / 0.003);

const saw = (f) => (t) => 2 * ((t * f) % 1) - 1;
const sine = (f) => (t) => Math.sin(2 * Math.PI * f * t);

const kick = (out, t0, amp = 1) =>
  tone(out, t0, 0.35, (t) => Math.sin(2 * Math.PI * (45 * t + (110 / 18) * (1 - Math.exp(-18 * t)))), expDecay(0.12), amp);
const noiseHit = (out, rand, t0, dur, tau, amp) =>
  tone(out, t0, dur, () => rand() * 2 - 1, expDecay(tau), amp);

const normalize = (x, peak) => {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  return x.map((v) => (v / m) * peak);
};
// 平均音量（RMS）をそろえ、大きすぎる瞬間だけやわらかく抑える
const loudness = (x, rms) => {
  let q = 0;
  for (const v of x) q += v * v;
  const g = rms / Math.sqrt(q / x.length);
  return x.map((v) => 0.8 * Math.tanh((v * g) / 0.8));
};
// やわらかいクリップ
const soft = (x) => x.map((v) => Math.tanh(v));

// ===== 各トラック =====

const rain = (seed, heavy) => {
  const rand = mulberry(seed);
  const out = buf();
  const bed = lowpass(highpass(noise(rand), 300), heavy ? 1800 : 4500);
  const wob = slowWobble(rand, 12);
  for (let i = 0; i < N; i++) out[i] += bed[i] * (0.75 + 0.25 * wob[i]);
  // 雨粒
  const drops = buf();
  const count = SECONDS * (heavy ? 30 : 18);
  for (let k = 0; k < count; k++) {
    noiseHit(drops, rand, rand() * SECONDS, 0.03, 0.004 + rand() * 0.008, 0.2 + rand() * 0.6);
  }
  mix(out, highpass(drops, 1500), heavy ? 0.35 : 0.5);
  // ぽつぽつ鳴る水滴
  for (let k = 0; k < SECONDS * 0.8; k++) {
    const f = 1400 + rand() * 1800;
    tone(out, rand() * SECONDS, 0.12, (t) => Math.sin(2 * Math.PI * f * (1 + 0.6 * t) * t), expDecay(0.025), 0.06);
  }
  if (heavy) {
    // 遠雷
    const rumble = lowpass(lowpass(noise(rand), 120), 90);
    const env = buf();
    for (const [c, g] of [[18, 1], [47, 0.6]]) {
      tone(env, c, 12, () => 1, (t) => Math.min(1, t / 1.2) * Math.exp(-Math.max(0, t - 1.2) / 3), g);
    }
    for (let i = 0; i < N; i++) out[i] += rumble[i] * env[i] * 9;
  }
  return loudness(out, heavy ? 0.12 : 0.13);
};

const waves = (seed) => {
  const rand = mulberry(seed);
  const out = buf();
  const body = lowpass(lowpass(noise(rand), 500), 700);
  const foam = highpass(lowpass(noise(rand), 6000), 1200);
  const period = 7.5; // 60 秒でちょうど 8 回
  const wob = slowWobble(rand, 8);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const ph = (t % period) / period;
    const swell = ph < 0.45 ? Math.pow(ph / 0.45, 2) : Math.exp(-(ph - 0.45) * 5);
    const crest = ph > 0.4 && ph < 0.75 ? Math.sin(((ph - 0.4) / 0.35) * Math.PI) : 0;
    const g = 0.7 + 0.3 * wob[i];
    out[i] = body[i] * (0.25 + swell) * 3 * g + foam[i] * crest * 0.9 * g;
  }
  return loudness(out, 0.11);
};

const cafe = (seed) => {
  const rand = mulberry(seed);
  const out = buf();
  // 遠くの話し声（帯域を絞ったノイズを音節くらいの速さで揺らす）
  for (let v = 0; v < 5; v++) {
    const voice = highpass(lowpass(noise(rand), 900 + rand() * 600), 250);
    const syll = slowWobble(rand, Math.round(SECONDS * (3 + rand() * 2)));
    const phrase = slowWobble(rand, 20);
    for (let i = 0; i < N; i++) out[i] += voice[i] * Math.pow(syll[i], 2) * Math.max(0, phrase[i] - 0.3) * 1.2;
  }
  // 空調のような低い音
  mix(out, lowpass(noise(rand), 150), 0.25);
  // 食器の音
  let t = 0.5;
  while (t < SECONDS - 0.5) {
    const base = 2000 + rand() * 1800;
    const amp = 0.05 + rand() * 0.07;
    tone(out, t, 0.6, (x) => Math.sin(2 * Math.PI * base * x) + 0.5 * Math.sin(2 * Math.PI * base * 1.63 * x) + 0.3 * Math.sin(2 * Math.PI * base * 2.41 * x), expDecay(0.12), amp);
    if (rand() < 0.4) tone(out, t + 0.12 + rand() * 0.1, 0.5, sine(base * 1.1), expDecay(0.08), amp * 0.6);
    t += 1.5 + rand() * 4;
  }
  return loudness(out, 0.1);
};

const lofi = (seed) => {
  const rand = mulberry(seed);
  const out = buf();
  const beat = 60 / 80; // 80 BPM、20 小節 = 60 秒
  const bar = beat * 4;
  // Fmaj7 → Em7 → Dm7 → Cmaj7
  const chords = [
    [53, 57, 60, 64],
    [52, 55, 59, 62],
    [50, 53, 57, 60],
    [48, 52, 55, 59]
  ];
  const keys = buf();
  const bass = buf();
  const drums = buf();
  const lead = buf();
  const ep = (f) => (t) =>
    Math.sin(2 * Math.PI * f * t + 0.6 * Math.sin(2 * Math.PI * f * 2 * t) * Math.exp(-t * 3)) * (1 + 0.15 * Math.sin(2 * Math.PI * 4.5 * t));
  const scale = [72, 74, 76, 79, 81, 84];
  for (let b = 0; b < 20; b++) {
    const ch = chords[b % 4];
    const t0 = b * bar;
    for (const hit of [0, 2.5]) {
      ch.forEach((m, j) => tone(keys, t0 + hit * beat + j * 0.012, hit === 0 ? 2.6 : 1.9, ep(mtof(m) * (1 + (rand() - 0.5) * 0.002)), expDecay(1.1), 0.16));
    }
    tone(bass, t0, beat * 2.2, (t) => Math.tanh(1.5 * Math.sin(2 * Math.PI * mtof(ch[0] - 12) * t)), adsr(0.01, 0.3, 0.6, 0.2), 0.5);
    tone(bass, t0 + beat * 2.5, beat * 1.3, (t) => Math.tanh(1.5 * Math.sin(2 * Math.PI * mtof(ch[0] - 12) * t)), adsr(0.01, 0.3, 0.6, 0.2), 0.42);
    // ドラム（少しスイング）
    kick(drums, t0, 0.9);
    kick(drums, t0 + beat * 2.5, 0.75);
    if (b % 2 === 1) kick(drums, t0 + beat * 1.75, 0.5);
    for (const s of [1, 3]) {
      noiseHit(drums, rand, t0 + s * beat, 0.2, 0.05, 0.35);
      tone(drums, t0 + s * beat, 0.12, sine(185), expDecay(0.04), 0.25);
    }
    for (let e = 0; e < 8; e++) {
      const swing = e % 2 === 1 ? beat * 0.08 : 0;
      noiseHit(drums, rand, t0 + e * beat * 0.5 + swing, 0.05, 0.012, e % 2 ? 0.08 : 0.12);
    }
    // ときどき短いメロディ
    if (b >= 4 && b % 2 === 0) {
      for (let n = 0; n < 4; n++) {
        const m = scale[Math.floor(rand() * scale.length)];
        const f = mtof(m);
        tone(lead, t0 + (n * 0.75 + 0.5) * beat, beat * 0.9, (t) => Math.sin(2 * Math.PI * f * t + 0.004 * Math.sin(2 * Math.PI * 5 * t) * f), adsr(0.02, 0.2, 0.5, 0.25), 0.1);
      }
    }
  }
  mix(out, lowpass(keys, 2200), 1);
  mix(out, lowpass(bass, 400), 1);
  mix(out, highpass(drums, 40), 0.9);
  mix(out, lowpass(lead, 3000), 1);
  // レコードのノイズ
  mix(out, lowpass(highpass(noise(rand), 2000), 6000), 0.015);
  for (let k = 0; k < SECONDS * 6; k++) noiseHit(out, rand, rand() * SECONDS, 0.004, 0.0008, 0.05 + rand() * 0.1);
  return normalize(soft(lowpass(out, 5000).map((v) => v * 1.4)), 0.7);
};

const cyber = (seed) => {
  const rand = mulberry(seed);
  const out = buf();
  const beat = 60 / 128; // 128 BPM、32 小節 = 60 秒
  const bar = beat * 4;
  // Am → F → C → G
  const chords = [
    [57, 60, 64],
    [53, 57, 60],
    [48, 52, 55],
    [55, 59, 62]
  ];
  const pad = buf();
  const bassB = buf();
  const arp = buf();
  const drums = buf();
  for (let b = 0; b < 32; b++) {
    const ch = chords[b % 4];
    const t0 = b * bar;
    // パッド（少しずらした 2 本のノコギリ波）
    ch.forEach((m) => {
      const f = mtof(m);
      tone(pad, t0, bar, (t) => saw(f * 1.004)(t) + saw(f * 0.996)(t), adsr(0.25, 0.3, 0.8, 0.25), 0.07);
    });
    // 16 分音符のベース
    const root = mtof(ch[0] - 24);
    for (let s = 0; s < 16; s++) {
      const f = s % 4 === 2 ? root * 2 : root;
      tone(bassB, t0 + s * beat * 0.25, beat * 0.22, saw(f), adsr(0.003, 0.06, 0.5, 0.03), 0.28);
    }
    // アルペジオ（9 小節目から）
    if (b >= 8) {
      const notes = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 24];
      for (let s = 0; s < 8; s++) {
        const f = mtof(notes[s % 4]);
        tone(arp, t0 + s * beat * 0.5, beat * 0.4, (t) => (Math.sin(2 * Math.PI * f * t) > 0 ? 1 : -1), adsr(0.004, 0.08, 0.35, 0.05), 0.06);
      }
    }
    for (let k = 0; k < 4; k++) kick(drums, t0 + k * beat, 1);
    for (const s of [1, 3]) {
      for (let r = 0; r < 3; r++) noiseHit(drums, rand, t0 + s * beat + r * 0.008, 0.18, 0.045, 0.3);
    }
    for (let e = 0; e < 4; e++) noiseHit(drums, rand, t0 + (e + 0.5) * beat, 0.09, e === 3 ? 0.05 : 0.018, 0.14);
  }
  mix(out, lowpass(lowpass(pad, 1800), 2500), 1);
  mix(out, lowpass(bassB, 650), 1);
  mix(out, lowpass(arp, 4000), 1);
  // ハイハットは高域だけ残す
  mix(out, highpass(drums, 30), 0.9);
  // 簡単なディレイで広がりを出す（ループ内で回り込む）
  const d = Math.round(beat * 0.75 * SR);
  const wet = buf();
  const src = lowpass(arp, 3000);
  for (let i = 0; i < N; i++) wet[i] = src[at(i - d)] * 0.35 + src[at(i - 2 * d)] * 0.15;
  mix(out, wet, 1);
  return normalize(soft(out.map((v) => v * 1.3)), 0.72);
};

const encode = (name, x, kbps) => {
  const enc = new lame.Mp3Encoder(1, SR, kbps);
  const pcm = new Int16Array(N);
  for (let i = 0; i < N; i++) pcm[i] = Math.max(-1, Math.min(1, x[i])) * 32767;
  const parts = [];
  for (let i = 0; i < N; i += 1152) {
    const b = enc.encodeBuffer(pcm.subarray(i, i + 1152));
    if (b.length) parts.push(Buffer.from(b));
  }
  const f = enc.flush();
  if (f.length) parts.push(Buffer.from(f));
  const file = path.join(outDir, name + '.mp3');
  fs.writeFileSync(file, Buffer.concat(parts));
  console.log(name, fs.statSync(file).size, 'bytes');
};

fs.mkdirSync(outDir, { recursive: true });
encode('rain', rain(11, false), 48);
encode('deep_rain', rain(23, true), 48);
encode('waves', waves(37), 48);
encode('cafe', cafe(41), 48);
encode('lofi', lofi(53), 64);
encode('cyber', cyber(67), 64);
