// Real policies from `npm run fixtures`. Skipped when the cache is missing.
import { expect, it } from 'vitest'
import { analyze, type Report } from '../src/core/analyze.ts'
import { cached, cachedDirs, parsePair } from './fixtures.ts'

const analyzeDir = (dir: string): Report => {
  const { policy, override } = parsePair(cached(dir))
  return analyze(policy, override)
}

/** Card id → [explicit, inherited]. */
const counts = (report: Report) =>
  Object.fromEntries(report.cards.map((card) => [card.category.id, [card.explicit, card.inherited]]))

const AMBIRE = 'ambire/lavamoat/webpack'
const METAMASK = cachedDirs.filter((dir) => dir.startsWith('metamask/'))

it.skipIf(!cachedDirs.includes(AMBIRE))('AmbireTech/extension @ 3f6c7af91f gives the reference numbers', () => {
  const report = analyzeDir(AMBIRE)
  expect(report.resources).toHaveLength(320)
  expect(counts(report)).toEqual({
    hero: [3, 10],
    chrome: [2, 0],
    storage: [7, 0],
    hardware: [1, 12],
    clipboard: [2, 12],
    fetch: [21, 8],
    // 36 through document, plus expo-asset and viem through Image.
    escape: [38, 0],
    overwrite: [3, 0],
  })
})

it.skipIf(METAMASK.length === 0)('MetaMask/metamask-extension @ 74db23ae6a: only the build policy is a Node policy', () => {
  expect(METAMASK).toHaveLength(9)
  for (const dir of METAMASK) {
    expect(analyzeDir(dir).node, dir).toBe(dir.endsWith('/build'))
  }
})
