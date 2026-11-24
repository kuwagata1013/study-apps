// タイマーを進める合図。画面が裏に回るとブラウザは setInterval を1分に1回まで間引くので、
// 間引かれない Worker から合図を送る（使えない環境では普通の setInterval）
export const startTicker = (onTick: () => void, ms = 250): (() => void) => {
  let interval: ReturnType<typeof setInterval> | undefined;
  let worker: Worker | undefined;
  const fallback = () => {
    interval ??= setInterval(onTick, ms);
  };
  try {
    const url = URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${ms})`], { type: 'text/javascript' }));
    worker = new Worker(url);
    worker.onmessage = onTick;
    worker.onerror = fallback;
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch {
    fallback();
  }
  // スマホで画面を開き直したときに、すぐ追いつく
  document.addEventListener('visibilitychange', onTick);
  return () => {
    worker?.terminate();
    clearInterval(interval);
    document.removeEventListener('visibilitychange', onTick);
  };
};
