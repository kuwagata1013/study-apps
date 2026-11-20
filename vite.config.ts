import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url))

// オフライン版：JS・CSS・画像・アイコンをすべて 1 つの HTML に埋め込み、ダブルクリックで開けるようにする
const singleFile = (): Plugin => ({
  name: 'offline-single-file',
  apply: 'build',
  enforce: 'post',
  generateBundle(_options, bundle) {
    const htmlFile = Object.values(bundle).find((f) => f.type === 'asset' && f.fileName.endsWith('.html'))
    if (!htmlFile || htmlFile.type !== 'asset') return
    let html = String(htmlFile.source)

    for (const [name, file] of Object.entries(bundle)) {
      if (file.type === 'chunk' && file.isEntry) {
        const code = file.code.replace(/<\/script/gi, '<\\/script')
        html = html.replace(/<script type="module" crossorigin src="[^"]+"><\/script>/, () => '')
        html = html.replace('</body>', () => `<script type="module">\n${code}\n</script>\n</body>`)
        delete bundle[name]
      } else if (file.type === 'asset' && name.endsWith('.css')) {
        html = html.replace(/<link rel="stylesheet" crossorigin href="[^"]+">/, () => `<style>\n${String(file.source)}\n</style>`)
        delete bundle[name]
      }
    }

    const favicon = readFileSync(fileURLToPath(new URL('./public/favicon.svg', import.meta.url)))
    html = html.replace(/href="\.?\/favicon\.svg"/, () => `href="data:image/svg+xml;base64,${favicon.toString('base64')}"`)
    htmlFile.source = html
  }
})

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  if (mode !== 'offline') {
    return { plugins: [react(), tailwindcss()] }
  }
  return {
    plugins: [react(), tailwindcss(), singleFile()],
    base: './',
    // Firebase を通信しない端末内の代用品に差し替える
    resolve: {
      alias: [
        { find: /^firebase\/app$/, replacement: src('offline/firebase-app.ts') },
        { find: /^firebase\/auth$/, replacement: src('offline/firebase-auth.ts') },
        { find: /^firebase\/firestore$/, replacement: src('offline/firebase-firestore.ts') },
        { find: /^firebase\/analytics$/, replacement: src('offline/firebase-analytics.ts') }
      ]
    },
    publicDir: false,
    build: {
      outDir: 'dist-offline',
      emptyOutDir: true,
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      cssCodeSplit: false,
      modulePreload: false
    }
  }
})
