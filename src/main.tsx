import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import OfflineBadge from './offline/OfflineBadge.tsx'
import { syncDataset } from './lib/dataset.ts'

// オフライン版（npm run build:offline）のときだけ「オフライン版」表示を出す
const isOffline = import.meta.env.MODE === 'offline'

// 画面を出す前に、新しい記録期間（データ2 など）が始まっていないか確認する。
// 始まっていれば端末の進み具合を初期化してから表示する
syncDataset().then((startedDataset) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
      {isOffline && <OfflineBadge />}
    </StrictMode>,
  )
  if (startedDataset !== null) {
    setTimeout(() => {
      alert(`新しい記録期間（データ${startedDataset}）が始まりました。\nレベル・EXP・クエスト・学習履歴を初期化しました。`)
    }, 300)
  }
})
