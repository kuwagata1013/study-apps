// 研究用の行動データ（Firestore researchEvents）
// 起動・BGM・画面タップ・クエスト・タイマー操作を 1 件ずつのイベントとして記録する。
// 学習時間そのものは researchLogs（researchLog.ts）に記録している。

import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { getParticipantId } from './participant';
import { getDeviceId } from './researchLog';

export type EventMode = 'start' | 'simple' | 'gamified' | 'admin';

export type ResearchEventType =
  | 'app_launch' // ページを開いた（起動）
  | 'app_resume' // しばらく裏に回っていた後に戻ってきた
  | 'bgm_select' // BGMの種類を選んだ
  | 'bgm_play' // BGM再生ボタンを押した
  | 'bgm_stop' // BGM停止（seconds = 再生していた秒数）
  | 'tap_summary' // 画面タップの集計（count = タップ数、seconds = 集計した秒数）
  | 'quest_add' // クエスト／ToDo を追加
  | 'quest_complete' // 達成
  | 'quest_uncomplete' // 達成を取り消し
  | 'quest_delete' // 削除
  | 'timer_start' // 計測開始・再開
  | 'timer_pause' // 一時停止（seconds = その時点の計測秒数）
  | 'timer_reset' // リセット（seconds = 破棄した計測秒数）
  | 'timer_finish'; // カウントダウン終了

export interface ResearchEventInput {
  label?: string; // 教科・BGM名・クエスト名など
  seconds?: number;
  count?: number;
}

// 再開とみなすまでの裏に回っていた時間
const RESUME_AFTER_MS = 5 * 60 * 1000;
// タップ集計を送る間隔
const TAP_FLUSH_MS = 60 * 1000;

// 1 回の起動（ページ読み込み）ごとの ID
const sessionId = 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const context: { uid: string; mode: EventMode; screen: string } = {
  uid: 'anonymous',
  mode: 'start',
  screen: ''
};

const clampInt = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(v)));

const send = (type: ResearchEventType, input: ResearchEventInput = {}) => {
  const data: Record<string, unknown> = {
    uid: context.uid,
    participantId: getParticipantId(),
    deviceId: getDeviceId(),
    sessionId,
    mode: context.mode,
    screen: context.screen.slice(0, 32),
    type,
    clientAt: Timestamp.fromMillis(Date.now()),
    createdAt: serverTimestamp()
  };
  if (input.label !== undefined) data.label = String(input.label).slice(0, 100);
  if (input.seconds !== undefined && Number.isFinite(input.seconds)) data.seconds = clampInt(input.seconds, 864000);
  if (input.count !== undefined && Number.isFinite(input.count)) data.count = clampInt(input.count, 1000000);

  addDoc(collection(db, 'researchEvents'), data).catch((e) => {
    console.error('行動データの保存エラー:', e);
  });
};

// ===== 画面タップの集計 =====
// タップ 1 回ごとに保存すると件数が膨大になるため、画面ごと・1 分ごとにまとめて送る。
// seconds はその画面を表示していた（アプリが前面にあった）秒数。count ÷ seconds でタップ頻度になる。

let tapCount = 0;
let activeMs = 0; // 送信済み分を除いた表示時間
let visibleSince: number | null = Date.now(); // 前面にある間の計測開始時刻

const takeActiveMs = () => {
  const now = Date.now();
  if (visibleSince !== null) {
    activeMs += now - visibleSince;
    visibleSince = now;
  }
  return activeMs;
};

// force: 画面切替・裏に回ったとき。タップ 0 回でも 5 秒以上表示していれば表示時間として送る
const flushTaps = (force = false) => {
  const ms = takeActiveMs();
  // 管理画面での操作は研究データに含めない
  if (context.mode === 'admin') {
    tapCount = 0;
    activeMs = 0;
    return;
  }
  if (tapCount === 0 && (!force || ms < 5000)) {
    if (force) activeMs = 0;
    return;
  }
  send('tap_summary', { count: tapCount, seconds: ms / 1000 });
  tapCount = 0;
  activeMs = 0;
};

// ===== 公開 API =====

export const trackEvent = (type: ResearchEventType, input?: ResearchEventInput) => {
  send(type, input);
};

// ログイン状態・表示中のモードが変わったら呼ぶ
export const setEventUser = (uid: string | null | undefined) => {
  context.uid = uid || 'anonymous';
};

export const setEventMode = (mode: EventMode) => {
  if (context.mode === mode) return;
  flushTaps(true);
  context.mode = mode;
  // シンプル・ゲームの画面名は各モードの中から setEventScreen で設定される（子の方が先に呼ばれる）
  if (mode === 'start' || mode === 'admin') context.screen = '';
};

// 各モード内のタブ（タイマー・クエストなど）が変わったら呼ぶ
export const setEventScreen = (screen: string) => {
  if (context.screen === screen) return;
  flushTaps(true);
  context.screen = screen;
};

let started = false;

// アプリ起動時に 1 回だけ呼ぶ（ログイン状態の確認が終わってから）
export const startEventTracking = () => {
  if (started) return;
  started = true;

  const launchKey = 'research_launch_count';
  let launchNo = 1;
  try {
    launchNo = Number(localStorage.getItem(launchKey) || '0') + 1;
    localStorage.setItem(launchKey, String(launchNo));
  } catch {
    // 無視
  }
  // count = この端末での通算起動回数
  send('app_launch', { count: launchNo });

  document.addEventListener(
    'pointerdown',
    () => {
      tapCount++;
    },
    { capture: true, passive: true }
  );
  setInterval(() => flushTaps(), TAP_FLUSH_MS);

  let hiddenAt: number | null = null;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushTaps(true);
      hiddenAt = Date.now();
      visibleSince = null;
    } else {
      visibleSince = Date.now();
      if (hiddenAt !== null) {
        const away = Date.now() - hiddenAt;
        hiddenAt = null;
        if (away >= RESUME_AFTER_MS) send('app_resume', { seconds: away / 1000 });
      }
    }
  });
  window.addEventListener('pagehide', () => flushTaps(true));
};
