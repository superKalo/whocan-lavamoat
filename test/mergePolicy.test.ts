import { mergePolicy as lavamoatMergePolicy } from 'lavamoat-core'
import { describe, expect, it } from 'vitest'
import { mergePolicy } from '../src/core/mergePolicy.ts'
import type { Policy } from '../src/core/policy.ts'
import { cached, cachedDirs, parsePair, synthetic, syntheticNames, type Pair } from './fixtures.ts'

type LavaMoatPolicy = Parameters<typeof lavamoatMergePolicy>[0]

const byKey = <T>(entries: Iterable<readonly [string, T]>) =>
  [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

/** Resource id → sorted globals, so key order does not matter. */
const globalsOf = (policy: Policy) =>
  byKey([...policy.resources].map(([id, r]) => [id, r.globals && byKey(r.globals)] as const))

const lavamoatGlobalsOf = (policy: LavaMoatPolicy) =>
  byKey(Object.entries(policy.resources).map(([id, r]) => [id, r.globals && byKey(Object.entries(r.globals))] as const))

/** Same globals as lavamoat-core, or a reported violation wherever lavamoat-core throws. */
const expectSameAsLavaMoat = (pair: Pair) => {
  const { policy, override } = parsePair(pair)
  const ours = mergePolicy(policy, override)
  let theirs: LavaMoatPolicy
  try {
    theirs = lavamoatMergePolicy(
      structuredClone(pair.policy) as LavaMoatPolicy,
      structuredClone(pair.override) as LavaMoatPolicy | undefined,
    )
  } catch (error) {
    const resource = /for resource "(.*)"/.exec(String(error))?.[1]
    expect(resource, String(error)).toBeDefined()
    expect(ours.violations.map((v) => v.resource)).toContain(resource)
    return
  }
  expect(ours.violations).toEqual([])
  expect(globalsOf(ours.policy)).toEqual(lavamoatGlobalsOf(theirs))
}

describe('mergePolicy', () => {
  it('returns the policy untouched without an override', () => {
    const { policy } = parsePair(synthetic('levels'))
    expect(mergePolicy(policy).policy).toBe(policy)
  })

  it('narrows a grant with false on the parent and true on a child', () => {
    const { policy, override } = parsePair(synthetic('narrowing'))
    const wallet = mergePolicy(policy, override).policy.resources.get('wallet')
    expect(byKey(wallet?.globals ?? [])).toEqual([
      ['navigator', false],
      ['navigator.hid', true],
    ])
  })

  it('reports a false child under a granted parent, which LavaMoat drops', () => {
    const { policy, override } = parsePair(synthetic('narrowing'))
    const merged = mergePolicy(policy, override)
    expect(merged.ignoredDenials).toEqual([{ resource: 'router', path: 'location.href', parent: 'location' }])
    expect(byKey(merged.policy.resources.get('router')?.globals ?? [])).toEqual([['location', true]])
  })

  it('reports a hierarchy violation where LavaMoat throws', () => {
    const { policy, override } = parsePair(synthetic('hierarchy'))
    expect(mergePolicy(policy, override).violations).toEqual([
      { resource: 'ext', path: 'chrome.runtime', parent: 'chrome' },
    ])
  })

  it('is idempotent, so an already merged file does no harm', () => {
    for (const name of syntheticNames) {
      const { policy, override } = parsePair(synthetic(name))
      const once = mergePolicy(policy, override)
      const twice = mergePolicy(once.policy, override)
      expect(globalsOf(twice.policy), name).toEqual(globalsOf(once.policy))
      expect(twice.violations, name).toEqual(once.violations)
    }
  })
})

describe('mergePolicy matches lavamoat-core', () => {
  for (const name of syntheticNames) {
    it(`synthetic/${name}`, () => expectSameAsLavaMoat(synthetic(name)))
  }
  if (cachedDirs.length === 0) it.skip('real policies (run npm run fixtures)', () => {})
  for (const dir of cachedDirs) {
    it(`real/${dir}`, () => expectSameAsLavaMoat(cached(dir)))
  }
})
