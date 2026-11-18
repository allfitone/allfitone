/**
 * Every `--afo-*` token an app's stylesheet reads must exist.
 *
 * This gate was written because two invented tokens shipped and nobody noticed.
 * `studio.composition.css` asked for `var(--afo-color-border)` in eleven
 * declarations and for `var(--afo-space-7)` in one, and neither name exists:
 * the Design System defines `--afo-color-border-subtle`, `-default`, `-strong`,
 * `-accent` and `-focus`, and its spacing scale jumps from 6 to 8. A `var()`
 * with no value makes the **whole declaration** invalid at computed-value time,
 * so each property fell back to its initial value — `border-style: none`,
 * `margin: 0`. Ten screens went without their separators from the day the name
 * was written, and nothing failed: not the build, not the type check, not the
 * lint, not a single one of the 2 400 end-to-end tests. Only a person looking
 * at the right screen could see it, and the symptom reads as a spacing problem
 * rather than a missing line.
 *
 * **Each app is compared against the copy it resolves, not against one global
 * list.** The three web apps run different versions of `@allfitone/react`, so a
 * token that exists in the newest one may not exist in the version an app
 * actually installs — and that difference is exactly what a shared list would
 * hide.
 *
 * Scope is the `--afo-*` namespace, which is the Design System's. A variable an
 * app defines for itself is legitimate wherever that definition lives in the
 * same stylesheet, and `var(--afo-x, fallback)` is legitimate too: a fallback
 * is what makes an absent token harmless, which is the whole point of the
 * syntax.
 */

import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const appsRoot = resolve(repositoryRoot, 'apps')
const skippedDirectories = new Set(['node_modules', 'dist', 'coverage'])

/** A definition: `--afo-space-4:` wherever it is declared. */
const definitionPattern = /--afo-[a-z0-9-]+(?=\s*:)/g
/**
 * A read, with whatever follows the name so a fallback can be told apart.
 * `var(--afo-x)` is a bare read; `var(--afo-x, 4px)` carries its own answer.
 */
const readPattern = /var\(\s*(--afo-[a-z0-9-]+)\s*(,?)/g

/** The tokens that version of the Design System defines, for one app. */
async function definedTokens(appDirectory) {
  const require = createRequire(join(appDirectory, 'package.json'))
  // The package exports `./tokens.css`, not the path it maps to: resolving
  // `dist/tokens.css` fails, and failing quietly is how a gate checks nothing.
  const tokensPath = require.resolve('@allfitone/react/tokens.css')
  const tokens = await readFile(tokensPath, 'utf8')
  return {
    names: new Set(tokens.match(definitionPattern) ?? []),
    source: relative(repositoryRoot, tokensPath).split(sep).join('/'),
  }
}

/**
 * The bare reads of a stylesheet that nothing defines.
 *
 * Reported with the line, because a token name says nothing about where it is.
 */
export function undefinedReads(css, defined) {
  const own = new Set(css.match(definitionPattern) ?? [])
  const findings = []
  const lines = css.split('\n')
  for (const [index, line] of lines.entries()) {
    for (const [, name, comma] of line.matchAll(readPattern)) {
      if (comma === ',') continue
      if (defined.has(name) || own.has(name)) continue
      findings.push({ line: index + 1, name })
    }
  }
  return findings
}

async function stylesheetsUnder(directory) {
  const found = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skippedDirectories.has(entry.name) || entry.name.startsWith('.')) continue
      found.push(...(await stylesheetsUnder(join(directory, entry.name))))
      continue
    }
    if (entry.name.endsWith('.css')) found.push(join(directory, entry.name))
  }
  return found
}

/**
 * The rule, proved on both halves before it is trusted.
 *
 * The two planted names are the two real defects this gate exists for, so a
 * change that stops catching them fails here rather than in production.
 */
function verifyRule() {
  const defined = new Set(['--afo-color-border-subtle', '--afo-space-4', '--afo-space-6'])

  const caught = undefinedReads(
    [
      '[data-a] { border-block-start: 1px solid var(--afo-color-border); }',
      '[data-b] { margin-block-start: var(--afo-space-7); }',
    ].join('\n'),
    defined,
  )
  if (caught.length !== 2 || caught[0]?.name !== '--afo-color-border' || caught[0]?.line !== 1) {
    throw new Error('The token gate stopped catching the two defects it was written for.')
  }

  const legitimate = undefinedReads(
    [
      '[data-a] { border-block-start: 1px solid var(--afo-color-border-subtle); }',
      // A fallback is what makes an absent token harmless.
      '[data-b] { gap: var(--afo-space-9, 36px); }',
      // Defined in the same stylesheet, which is where an app's own belong.
      ':root { --afo-site-surface: #fff; }',
      '[data-c] { background: var(--afo-site-surface); }',
    ].join('\n'),
    defined,
  )
  if (legitimate.length > 0) {
    throw new Error(
      `Legitimate token use failed the gate's self-test: ${legitimate
        .map((finding) => finding.name)
        .join(', ')}`,
    )
  }
}

verifyRule()

const violations = []
const checked = []

for (const app of await readdir(appsRoot, { withFileTypes: true })) {
  if (!app.isDirectory()) continue
  const appDirectory = join(appsRoot, app.name)
  const stylesheets = await stylesheetsUnder(appDirectory)
  if (stylesheets.length === 0) continue

  const sheets = []
  for (const stylesheet of stylesheets) {
    sheets.push({
      repositoryPath: relative(repositoryRoot, stylesheet).split(sep).join('/'),
      css: await readFile(stylesheet, 'utf8'),
    })
  }
  const readsTokens = sheets.some((sheet) => sheet.css.includes('var(--afo-'))

  let tokens
  try {
    tokens = await definedTokens(appDirectory)
  } catch (error) {
    /*
     * An app whose stylesheets read no token needs no token list. One that does
     * read them and cannot be checked is **reported**, never skipped: a gate
     * that goes quiet when its input is missing is the failure it exists to
     * prevent.
     */
    if (readsTokens) {
      violations.push(
        `apps/${app.name} reads --afo-* tokens and its Design System could not be resolved: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
    continue
  }

  for (const { repositoryPath, css } of sheets) {
    checked.push(repositoryPath)
    for (const finding of undefinedReads(css, tokens.names)) {
      violations.push(
        `${repositoryPath}:${String(finding.line)} reads ${finding.name}, which ${tokens.source} does not define`,
      )
    }
  }
}

if (violations.length > 0) {
  console.error('Design tokens that do not exist:')
  for (const violation of violations.toSorted()) {
    console.error(`- ${violation}`)
  }
  console.error(
    '\nA var() with no value drops the whole declaration, so the property falls back to its initial value and nothing fails. Use a token the installed version defines, or give the var() a fallback.',
  )
  process.exitCode = 1
} else {
  console.log(`Design tokens are defined in all ${String(checked.length)} app stylesheets.`)
}
