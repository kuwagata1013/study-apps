// 研究参加者ID（端末をまたいで同じ人の記録を集計するためのID）

const PARTICIPANT_KEY = 'participant_id';

export const PARTICIPANT_ID_MAX = 32;
// 英数字・ハイフン・アンダースコアのみ（例: A01, class3-12）
export const PARTICIPANT_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

export const normalizeParticipantId = (raw: string) => raw.trim();

export const isValidParticipantId = (id: string) => PARTICIPANT_ID_PATTERN.test(id);

export const getParticipantId = (): string => {
  try {
    return localStorage.getItem(PARTICIPANT_KEY) || '';
  } catch {
    return '';
  }
};

// この端末の参加者IDを消す（アカウントから来たIDを、ログアウトしたときに残さないため）
export const clearParticipantId = () => {
  try {
    localStorage.removeItem(PARTICIPANT_KEY);
  } catch {
    // 無視
  }
};

export const saveParticipantId = (id: string) => {
  try {
    localStorage.setItem(PARTICIPANT_KEY, id);
  } catch (e) {
    console.error('参加者IDの保存に失敗しました:', e);
  }
};
