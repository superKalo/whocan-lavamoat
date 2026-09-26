// Downloads real policies for the tests into test/fixtures/.cache, which is
// gitignored: Ambire's extension is GPL-3.0 and MetaMask's is proprietary, so
// they stay out of the repo. Every file is pinned to a commit.
import { mkdir, writeFile } from 'node:fs/promises'

const sources = [
  {
    name: 'ambire',
    repo: 'AmbireTech/extension',
    sha: '3f6c7af91fde4c056da96ff9ede5c39f53ed7083',
    dirs: ['lavamoat/webpack'],
  },
  {
    name: 'metamask',
    repo: 'MetaMask/metamask-extension',
    sha: '74db23ae6af8c96998352f230df507575fa58aa9',
    dirs: [
      'lavamoat/webpack/build',
      ...['mv2', 'mv3'].flatMap((mv) =>
        ['beta', 'experimental', 'flask', 'main'].map((build) => `lavamoat/webpack/${mv}/${build}`),
      ),
    ],
  },
]

const cache = new URL('../test/fixtures/.cache/', import.meta.url)

for (const { name, repo, sha, dirs } of sources) {
  for (const dir of dirs) {
    for (const file of ['policy.json', 'policy-override.json']) {
      const url = `https://raw.githubusercontent.com/${repo}/${sha}/${dir}/${file}`
      const response = await fetch(url)
      if (!response.ok) throw new Error(`${response.status} ${url}`)
      const target = new URL(`${name}/${dir}/${file}`, cache)
      await mkdir(new URL('.', target), { recursive: true })
      await writeFile(target, await response.text())
      console.log(`${name}/${dir}/${file}`)
    }
  }
}
