// 研究用学習ログ（Firestore researchLogs）の保存処理
// シンプル版・ゲーム版で記録する項目をそろえるため、保存はここに一本化する

import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { getParticipantId } from './participant';
import { getLocalDataset } from './dataset';

export type StudyMode = 'simple' | 'gamified';

export interface ResearchLogInput {
  mode: StudyMode;
  uid?: string | null;
  subject: string;
  durationSeconds: number;
  // 最初に計測を開始した時刻（ミリ秒）。不明な場合は終了時刻 − 学習時間で補う
  startedAtMs?: number | null;
  memo?: string;
  // シンプル版のみ: 加算（countup）/ 減算（countdown）
  timerType?: 'countup' | 'countdown';
  // ゲーム版のみ: 保存時点のレベルと、この記録で得たEXP
  level?: number;
  expGained?: number;
}

export const getDeviceId = (): string => {
  let deviceId = localStorage.getItem('device_id');
  if (!deviceId) {
    deviceId = 'dev_' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem('device_id', deviceId);
  }
  return deviceId;
};

export const saveResearchLog = async (input: ResearchLogInput) => {
  const durationSeconds = Math.max(0, Math.round(input.durationSeconds));
  const endedAtMs = Date.now();
  const startedAtMs = Math.min(
    input.startedAtMs ?? endedAtMs - durationSeconds * 1000,
    endedAtMs
  );

  const data: Record<string, unknown> = {
    uid: input.uid || 'anonymous',
    participantId: getParticipantId(),
    deviceId: getDeviceId(),
    mode: input.mode,
    dataset: getLocalDataset(),
    subject: input.subject.slice(0, 100),
    durationSeconds,
    durationMinutes: Math.round(durationSeconds / 60),
    startedAt: Timestamp.fromMillis(startedAtMs),
    memo: (input.memo ?? '').slice(0, 2000),
    userAgent: navigator.userAgent.slice(0, 512),
    createdAt: serverTimestamp()
  };
  if (input.timerType) data.timerType = input.timerType;
  // Firestore ルールは整数のみ受け付けるため、数値でない値は送らない
  if (input.level !== undefined && Number.isFinite(input.level)) data.level = Math.max(1, Math.round(input.level));
  if (input.expGained !== undefined && Number.isFinite(input.expGained)) data.expGained = Math.max(0, Math.round(input.expGained));

  try {
    await addDoc(collection(db, 'researchLogs'), data);
  } catch (e) {
    console.error('Firestore保存エラー:', e);
  }
};
