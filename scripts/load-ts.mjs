/**
 * Load a TypeScript module in a plain node script, using the TypeScript compiler
 * that is already a devDependency. No new packages, no build step.
 *
 * Exists so the check scripts exercise the real modules instead of a hand-copied
 * mirror of their logic, which is the failure mode where the check passes and the
 * shipped code is broken. Relative imports are resolved recursively; bare
 * specifiers fall through to normal node resolution.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import ts from 'typescript'

const cache = new Map()

function resolveTs(base) {
  const candidates = [`${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts'), base]
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  throw new Error(`load-ts: cannot resolve ${base}`)
}

export function loadTs(path) {
  const file = resolveTs(resolve(path))
  const cached = cache.get(file)
  if (cached) return cached.exports

  const { outputText, diagnostics } = ts.transpileModule(readFileSync(file, 'utf8'), {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  })
  if (diagnostics?.length) {
    throw new Error(`load-ts: ${file}\n${diagnostics.map(d => d.messageText).join('\n')}`)
  }

  const mod = { exports: {} }
  cache.set(file, mod)

  const require = spec =>
    spec.startsWith('.') ? loadTs(resolve(dirname(file), spec)) : createRequire(file)(spec)

  new Function('require', 'module', 'exports', '__filename', outputText)(
    require,
    mod,
    mod.exports,
    file,
  )
  return mod.exports
}
