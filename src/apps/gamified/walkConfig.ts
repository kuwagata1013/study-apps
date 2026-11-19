// 歩行アニメーションと背景スクロールを同期させるための設定

import { WALK_FRAMES, SPRITE_H, SPRITE_W, SPRITE_PX, STRIDE_HALF } from './characterSprite';

// 1コマの表示時間（ミリ秒）。12コマで1周（左右1歩ずつ）
export const WALK_FRAME_MS = 80;
export const WALK_FRAME_COUNT = WALK_FRAMES;

// キャラクターの表示サイズ（px）。1ドット = 4px のちょうどの倍率で表示する
export const CHARACTER_WIDTH = SPRITE_W * SPRITE_PX;
export const CHARACTER_HEIGHT = SPRITE_H * SPRITE_PX;

// 接地した足は、1周の半分の時間で「片足の歩幅（前後の幅）」だけ一定の速さで後ろへ動く。
// 地面（近景）をこれと同じ速さで流すと、足が地面を滑って見えない（px/秒）
export const GROUND_SPEED =
  (2 * STRIDE_HALF * SPRITE_PX) / ((WALK_FRAME_MS * WALK_FRAME_COUNT) / 2 / 1000);
