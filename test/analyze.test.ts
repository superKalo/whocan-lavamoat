import { describe, expect, it } from 'vitest'
import { analyze, type Report } from '../src/core/analyze.ts'
import { parsePair, synthetic } from './fixtures.ts'

const analyzeFixture = (name: string): Report => {
  const { policy, override } = parsePair(synthetic(name))
  return analyze(policy, override)
}

/** Card id → { resource: state }. */
const states = (report: Report) =>
  Object.fromEntries(
    report.cards.map((card) => [
      card.category.id,
      Object.fromEntries([...card.matches].map(([id, match]) => [id, match.state])),
    ]),
  )

const cardOf = (report: Report, id: string) => report.cards.find((card) => card.category.id === id)

const warningsOf = (report: Report) => report.warnings.map(({ code, resource, key }) => [code, resource, key])

describe('analyze', () => {
  it('tells explicit grants from inherited ones, and builds the hero card from both', () => {
    const report = analyzeFixture('levels')
    expect(report.resources).toEqual(['broad', 'ext', 'hid', 'mixed', 'quiet'])
    expect(states(report)).toEqual({
      hero: { broad: 'inherited', ext: 'explicit', mixed: 'inherited' },
      chrome: { ext: 'explicit' },
      storage: { mixed: 'explicit' },
      hardware: { broad: 'inherited', hid: 'explicit', mixed: 'inherited' },
      clipboard: { broad: 'inherited', mixed: 'inherited' },
      fetch: { broad: 'inherited', ext: 'explicit', mixed: 'inherited' },
      escape: {},
      overwrite: {},
    })
    expect(cardOf(report, 'hardware')?.matches.get('broad')?.grants).toEqual(['navigator'])
    expect(report.warnings).toEqual([])
  })

  it('ignores aliases of the own global, but not top and parent', () => {
    const report = analyzeFixture('aliases')
    expect(report.resources).toEqual(['a', 'b', 'c', 'd'])
    expect(states(report).fetch).toEqual({ c: 'explicit' })
    expect(states(report).storage).toEqual({})
    expect(states(report).escape).toEqual({ b: 'explicit' })
    expect(warningsOf(report)).toEqual([
      ['alias-no-effect', 'a', 'window'],
      ['alias-prefix-no-effect', 'd', 'self.localStorage'],
      ['alias-prefix-no-effect', 'd', 'window.fetch'],
    ])
    expect(report.warnings.find((w) => w.key === 'window.fetch')?.message).toBe('No effect. Did you mean "fetch"?')
    expect(report.warnings.find((w) => w.key === 'window')?.severity).toBe('info')
  })

  it('applies false on a parent and warns about a false child under a granted parent', () => {
    const report = analyzeFixture('narrowing')
    expect(states(report).hardware).toEqual({ wallet: 'explicit' })
    expect(states(report).fetch).toEqual({})
    expect(warningsOf(report)).toEqual([['ignored-denial', 'router', 'location.href']])
  })

  it('keeps drawing when LavaMoat would fail the build', () => {
    const report = analyzeFixture('hierarchy')
    expect(states(report).chrome).toEqual({ ext: 'explicit' })
    expect(warningsOf(report)).toEqual([['hierarchy', 'ext', 'chrome.runtime']])
  })

  it('counts a write only when another resource reads the same key', () => {
    const report = analyzeFixture('write')
    expect(states(report).overwrite).toEqual({ worklets: 'explicit' })
    expect(cardOf(report, 'overwrite')?.matches.get('worklets')).toEqual({
      state: 'explicit',
      grants: ['console'],
      readers: new Map([['console', 1]]),
    })
    expect(warningsOf(report)).toEqual([['nested-write', 'nested', 'process.exitCode']])
  })

  it('puts real DOM nodes, windows and workers on the escape card', () => {
    const report = analyzeFixture('escape')
    expect(states(report).escape).toEqual({ dom: 'explicit', img: 'explicit', worker: 'explicit' })
  })

  it('counts override-only resources only if they grant a global', () => {
    expect(analyzeFixture('total').resources).toEqual(['a', 'b', 'only-globals'])
  })

  it('warns about keys LavaMoat rejects or that escape the sandbox', () => {
    const report = analyzeFixture('dangerous')
    expect(warningsOf(report)).toEqual([
      ['dangerous-global', 'x', 'Compartment'],
      ['dangerous-global', 'x', 'Function'],
      ['proto-key', 'x', '__proto__'],
      ['proto-key', 'x', '__proto__.polluted'],
      ['dangerous-global', 'x', 'eval'],
      ['unknown-value', 'x', 'fetch'],
    ])
    expect(states(report).fetch).toEqual({})
  })
})
