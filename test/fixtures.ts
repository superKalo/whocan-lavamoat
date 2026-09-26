// Policy pairs for the tests: the synthetic ones in this repo, and the real
// ones that `npm run fixtures` downloads into test/fixtures/.cache.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { parsePolicy, type Policy } from '../src/core/policy.ts'

export interface Pair {
  readonly policy: unknown
  readonly override?: unknown
}

const readJson = (url: URL): unknown => JSON.parse(readFileSync(url, 'utf8'))

const readPair = (dir: URL): Pair => {
  const override = new URL('policy-override.json', dir)
  return {
    policy: readJson(new URL('policy.json', dir)),
    ...(existsSync(override) ? { override: readJson(override) } : {}),
  }
}

export const parsePair = (pair: Pair): { policy: Policy; override: Policy | undefined } => ({
  policy: parsePolicy(pair.policy, 'policy.json'),
  override: pair.override === undefined ? undefined : parsePolicy(pair.override, 'policy-override.json'),
})

const syntheticRoot = new URL('./fixtures/synthetic/', import.meta.url)
const cacheRoot = new URL('./fixtures/.cache/', import.meta.url)

export const syntheticNames = readdirSync(syntheticRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

export const synthetic = (name: string): Pair => readPair(new URL(`${name}/`, syntheticRoot))

/** Cached folders with a policy.json, like "ambire/lavamoat/webpack". Empty without the cache. */
export const cachedDirs = existsSync(cacheRoot)
  ? readdirSync(cacheRoot, { recursive: true, encoding: 'utf8' })
      .filter((path) => path.endsWith('/policy.json'))
      .map((path) => path.slice(0, -'/policy.json'.length))
      .sort()
  : []

export const cached = (dir: string): Pair => readPair(new URL(`${dir}/`, cacheRoot))
