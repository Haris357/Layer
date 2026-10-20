// Fails if any regex in src/ can backtrack catastrophically (ReDoS).
//
// Layer runs regexes on whatever the user copies (Clipboard widget, notch),
// so a pattern with nested/overlapping quantifiers can freeze the whole UI —
// v1.11.1 shipped one that hung forever on paths like "C:\src\a.ts:142".
// Every regex literal and `new RegExp("...")` is checked with recheck; a
// RegExp built from a non-literal can't be checked and fails too, so it gets
// reviewed by hand.
//
//   npm run check:regex
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

process.env.RECHECK_BACKEND ??= 'pure' // no Java needed; same results
const { check } = await import('recheck')

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')

const files = []
;(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(tsx?|jsx?)$/.test(e.name)) files.push(p)
  }
})(root)

const found = []
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')
  const kind = /x$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)
  const where = (n) =>
    `${path.relative(root, file)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`
  const visit = (n) => {
    if (n.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      const raw = n.getText()
      const end = raw.lastIndexOf('/')
      found.push({ where: where(n), source: raw.slice(1, end), flags: raw.slice(end + 1) })
    } else if (ts.isNewExpression(n) && n.expression.getText() === 'RegExp') {
      const [src, fl] = n.arguments ?? []
      if (src && ts.isStringLiteralLike(src)) {
        found.push({
          where: where(n),
          source: src.text,
          flags: fl && ts.isStringLiteralLike(fl) ? fl.text : '',
        })
      } else {
        found.push({ where: where(n), dynamic: n.getText() })
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
}

let failures = 0
for (const r of found) {
  if (r.dynamic) {
    failures++
    console.error(`✗ ${r.where}  RegExp built at runtime can't be checked: ${r.dynamic}`)
    continue
  }
  // g/y only change how matching is driven, not its complexity.
  const res = await check(r.source, r.flags.replace(/[gy]/g, ''), { timeout: 20000 })
  if (res.status === 'safe') continue
  failures++
  const detail =
    res.status === 'vulnerable'
      ? `${res.complexity.type} backtracking, e.g. ${res.attack.pattern}`
      : `could not be verified (${res.status})`
  console.error(`✗ ${r.where}  /${r.source}/${r.flags}  ${detail}`)
}

console.log(`Checked ${found.length} regexes in ${files.length} files.`)
if (failures) {
  console.error(`${failures} unsafe regex(es). Rewrite them without nested or overlapping quantifiers.`)
  process.exit(1)
}
