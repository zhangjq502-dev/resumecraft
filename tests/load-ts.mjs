import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import ts from 'typescript'
const require = createRequire(import.meta.url)
const cache = new Map()
// 测试中将项目 TS 模块转为 CJS 加载，无需额外测试框架或生成测试构建目录。
export function loadTS(path) {
  const file = resolve(path)
  if (cache.has(file)) return cache.get(file).exports
  const module = { exports: {} }
  cache.set(file, module)
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const localRequire = (specifier) =>
    specifier.startsWith('.')
      ? loadTS(resolve(dirname(file), specifier + '.ts'))
      : require(specifier)
  new Function('module', 'exports', 'require', code)(module, module.exports, localRequire)
  return module.exports
}
