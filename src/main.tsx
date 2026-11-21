import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import OfflineBadge from './offline/OfflineBadge.tsx'
import { syncDataset } from './lib/dataset.ts'

// オフライン版（npm run build:offline）のときだけ「オフライン版」表示を出す
const isOffline = import.meta.env.MODE === 'offline'

// 画面を出す前に、記録期間（データ1・データ2 など）が切り替わっていないか確認する。
// 切り替わっていれば端末の進み具合を切り替えてから表示する
syncDataset().then((change) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
      {isOffline && <OfflineBadge />}
    </StrictMode>,
  )
  if (change !== null) {
    const message =
      change.to > change.from && !change.restored
        ? `新しい記録期間（データ${change.to}）が始まりました。\nレベル・EXP・クエスト・学習履歴を初期化しました。`
        : change.restored
          ? `記録期間がデータ${change.to}に切り替わりました。\nこの端末に残っていたデータ${change.to}のレベル・EXP・クエスト・学習履歴に戻しました。`
          : `記録期間がデータ${change.to}に切り替わりました。\nこの端末にはデータ${change.to}の進み具合が残っていなかったので、最初からになります。`
    setTimeout(() => alert(message), 300)
  }
})
