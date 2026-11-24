// オフライン版（dist-offline/index.html）を、管理画面からダウンロードできるよう公開フォルダに入れる
import { copyFileSync } from 'node:fs'

copyFileSync('dist-offline/index.html', 'dist/study-app-offline.html')
console.log('dist/study-app-offline.html を作りました')
