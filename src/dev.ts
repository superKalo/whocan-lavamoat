// Dev only, and dropped from the build: ?fixture=<folder under test/fixtures>
// loads that pair, e.g. ?fixture=.cache/ambire/lavamoat/webpack or
// ?fixture=synthetic/aliases.
import { parsePolicyText, type Policy } from './core/policy.ts'

export const loadFixture = async (
  dir: string,
): Promise<{ label: string; policy: Policy; override: Policy | undefined }> => {
  const base = `${import.meta.env.BASE_URL}test/fixtures/${dir}/`
  const read = async (file: string): Promise<Policy | undefined> => {
    const response = await fetch(base + file, { headers: { accept: 'application/json' } })
    if (!response.ok || !response.headers.get('content-type')?.includes('json')) return undefined
    return parsePolicyText(await response.text(), file)
  }
  const policy = await read('policy.json')
  if (!policy) throw new Error(`No policy.json in test/fixtures/${dir}. The real ones come from npm run fixtures.`)
  return { label: dir, policy, override: await read('policy-override.json') }
}
