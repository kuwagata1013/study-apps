// 学習の「1日」の区切り。午前4時で日付が変わる扱いにする
// （夜ふかしして 0時〜4時に記録した分は、前の日の学習としてまとめて集計する。今日の分・連続日数・デイリークエストなども同じ）

export const DAY_START_HOUR = 4;
const SHIFT_MS = DAY_START_HOUR * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');

// その時刻が属する学習日を、ふつうの Date として返す（4時間前にずらすだけ。年月日・曜日を読むのに使う）
export const studyDate = (t: Date | number = Date.now()) => new Date((typeof t === 'number' ? t : t.getTime()) - SHIFT_MS);

// 今の学習日（午前0時〜4時は前の日）
export const studyNow = () => studyDate();

// 学習日の日付キー（YYYY-MM-DD）
export const studyDayKey = (t: Date | number = Date.now()) => {
  const d = studyDate(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// その学習日が始まる時刻（午前4時）
export const studyDayStart = (t: Date | number = Date.now()) => {
  const d = studyDate(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), DAY_START_HOUR);
};
