import { describe, expect, it } from 'vitest'
import { readFiles } from '../src/sources/file.ts'
import { deepLink, findPolicies, isFullSha, parseRepo } from '../src/sources/github.ts'

const SHA = '3f6c7af91fde4c056da96ff9ede5c39f53ed7083'

describe('parseRepo', () => {
  it.each([
    ['AmbireTech/extension', { owner: 'AmbireTech', name: 'extension' }],
    ['  AmbireTech/extension/  ', { owner: 'AmbireTech', name: 'extension' }],
    ['AmbireTech/extension@3f6c7af91f', { owner: 'AmbireTech', name: 'extension', ref: '3f6c7af91f' }],
    ['owner/repo@feature/x', { owner: 'owner', name: 'repo', ref: 'feature/x' }],
    ['https://github.com/AmbireTech/extension', { owner: 'AmbireTech', name: 'extension' }],
    ['https://www.github.com/AmbireTech/extension.git', { owner: 'AmbireTech', name: 'extension' }],
    ['https://github.com/AmbireTech/extension/pulls?q=is%3Aopen#top', { owner: 'AmbireTech', name: 'extension' }],
    [
      'github.com/MetaMask/metamask-extension/tree/main/lavamoat/webpack/mv3',
      { owner: 'MetaMask', name: 'metamask-extension', ref: 'main', dir: 'lavamoat/webpack/mv3' },
    ],
    [
      'https://github.com/AmbireTech/extension/blob/main/lavamoat/webpack/policy-override.json',
      { owner: 'AmbireTech', name: 'extension', ref: 'main', policy: 'lavamoat/webpack/policy.json' },
    ],
  ])('reads %s', (input, expected) => {
    expect(parseRepo(input)).toEqual(expected)
  })

  it.each(['', 'AmbireTech', 'AmbireTech/', '/extension', 'owner/repo name', '<script>/x', 'owner/re"po'])(
    'rejects %j',
    (input) => {
      expect(parseRepo(input)).toBeUndefined()
    },
  )
})

describe('findPolicies', () => {
  const blob = (path: string, sha: string) => ({ path, type: 'blob', sha })
  const tree = [
    blob('lavamoat/webpack/build/policy.json', 'b'),
    blob('lavamoat/webpack/build/policy-override.json', 'bo'),
    ...['beta', 'flask', 'main'].flatMap((build) => [
      blob(`lavamoat/webpack/mv3/${build}/policy.json`, 'p3'),
      blob(`lavamoat/webpack/mv3/${build}/policy-override.json`, 'o3'),
    ]),
    // Same policy, different overrides: two boards, so two entries.
    blob('lavamoat/webpack/mv2/beta/policy.json', 'p2'),
    blob('lavamoat/webpack/mv2/beta/policy-override.json', 'o2b'),
    blob('lavamoat/webpack/mv2/main/policy.json', 'p2'),
    blob('lavamoat/webpack/mv2/main/policy-override.json', 'o2m'),
    // The old browserify layout: one override, one folder up.
    blob('lavamoat/browserify/main/policy.json', 'pb'),
    blob('lavamoat/browserify/flask/policy.json', 'pb'),
    blob('lavamoat/browserify/policy-override.json', 'ob'),
    blob('lavamoat/node/policy.json', 'n'),
    blob('node_modules/some-package/lavamoat/node/policy.json', 'x'),
    blob('test/policy.json', 'y'),
    { path: 'lavamoat/webpack', type: 'tree', sha: 't' },
  ]

  it('groups identical pairs and finds each override', () => {
    expect(findPolicies(tree)).toEqual([
      {
        dirs: ['lavamoat/browserify/flask', 'lavamoat/browserify/main'],
        policyPath: 'lavamoat/browserify/flask/policy.json',
        overridePath: 'lavamoat/browserify/policy-override.json',
      },
      { dirs: ['lavamoat/node'], policyPath: 'lavamoat/node/policy.json', overridePath: null },
      {
        dirs: ['lavamoat/webpack/build'],
        policyPath: 'lavamoat/webpack/build/policy.json',
        overridePath: 'lavamoat/webpack/build/policy-override.json',
      },
      {
        dirs: ['lavamoat/webpack/mv2/beta'],
        policyPath: 'lavamoat/webpack/mv2/beta/policy.json',
        overridePath: 'lavamoat/webpack/mv2/beta/policy-override.json',
      },
      {
        dirs: ['lavamoat/webpack/mv2/main'],
        policyPath: 'lavamoat/webpack/mv2/main/policy.json',
        overridePath: 'lavamoat/webpack/mv2/main/policy-override.json',
      },
      {
        dirs: ['lavamoat/webpack/mv3/beta', 'lavamoat/webpack/mv3/flask', 'lavamoat/webpack/mv3/main'],
        policyPath: 'lavamoat/webpack/mv3/beta/policy.json',
        overridePath: 'lavamoat/webpack/mv3/beta/policy-override.json',
      },
    ])
  })

  it('keeps only policies under the linked folder', () => {
    expect(findPolicies(tree, 'lavamoat/webpack/mv3').map((group) => group.dirs.length)).toEqual([3])
  })
})

describe('deepLink and isFullSha', () => {
  it('pins the commit and the policy path', () => {
    expect(deepLink({ owner: 'AmbireTech', name: 'extension' }, SHA, 'lavamoat/webpack/policy.json')).toBe(
      `?repo=AmbireTech/extension@${SHA}&policy=lavamoat/webpack/policy.json`,
    )
  })

  it('tells a full commit SHA from a short one or a branch', () => {
    expect([SHA, SHA.toUpperCase(), SHA.slice(0, 10), 'main', `${SHA.slice(0, 39)}g`].map(isFullSha)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ])
  })
})

describe('readFiles', () => {
  const file = (name: string, resources: object = {}) => new File([JSON.stringify({ resources })], name)

  it('tells the policy from the override by name', async () => {
    const loaded = await readFiles([file('policy-override.json', { a: {} }), file('policy.json', { b: {}, c: {} })])
    expect([loaded.policy.resources.size, loaded.override?.resources.size]).toEqual([2, 1])
  })

  it('refuses an override alone and two policies', async () => {
    await expect(readFiles([file('policy-override.json')])).rejects.toThrow('only the override')
    await expect(readFiles([file('policy.json'), file('other-policy.json')])).rejects.toThrow('Could not tell')
  })
})
