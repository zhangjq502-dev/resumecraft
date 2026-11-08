import { cp, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
const require = createRequire(import.meta.url)
const source = dirname(require.resolve('pdfjs-dist/package.json'))
const target = resolve('src/renderer/public/pdf-assets')
await mkdir(target, { recursive: true })
for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
  await cp(resolve(source, directory), resolve(target, directory), { recursive: true })
}
console.log('PDF fonts and CMaps prepared locally')
