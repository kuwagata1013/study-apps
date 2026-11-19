// 歩行アニメーションと背景スクロールを同期させるための設定

// 1コマの表示時間（ミリ秒）。8コマで1周（左右1歩ずつ）
export const WALK_FRAME_MS = 115;
export const WALK_FRAME_COUNT = 8;

// キャラクター画像（200×350px）の表示高さ（px）
export const CHARACTER_HEIGHT = 224;
const SPRITE_HEIGHT = 350;

// 元画像での1周あたりの歩幅（px）。接地した足がコマの間に後ろへ動く量から計測
const STRIDE_PER_CYCLE = 164;

// 足が地面を滑って見えないよう、地面（近景）の流れる速さを歩幅に合わせる（px/秒）
export const GROUND_SPEED =
  (STRIDE_PER_CYCLE * (CHARACTER_HEIGHT / SPRITE_HEIGHT)) / ((WALK_FRAME_MS * WALK_FRAME_COUNT) / 1000);
