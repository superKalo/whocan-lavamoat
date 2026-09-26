// Policies from a drop, the file picker or a paste. Nothing leaves the browser.
import { parsePolicyText } from '../core/policy.ts'
import { SourceError, type PolicyFiles } from './source.ts'

const MAX_BYTES = 20_000_000

/** One or two .json files. The one with "override" in its name is the override. */
export const readFiles = async (files: readonly File[]): Promise<PolicyFiles & { names: string[] }> => {
  const json = files.filter((file) => file.name.toLowerCase().endsWith('.json'))
  if (json.length === 0 || json.length > 2) {
    throw new SourceError('Drop policy.json, plus policy-override.json if you have one.')
  }
  const tooBig = json.find((file) => file.size > MAX_BYTES)
  if (tooBig) throw new SourceError(`${tooBig.name} is too big to be a policy.`)

  const isOverride = (file: File) => file.name.toLowerCase().includes('override')
  const policies = json.filter((file) => !isOverride(file))
  const [policyFile] = policies
  const [overrideFile, ...extra] = json.filter(isOverride)
  if (!policyFile) throw new SourceError('That is only the override. Drop policy.json with it.')
  if (policies.length > 1 || extra.length > 0) {
    throw new SourceError('Could not tell the policy from the override. Name the override policy-override.json.')
  }
  return {
    policy: parsePolicyText(await policyFile.text(), policyFile.name),
    override: overrideFile ? parsePolicyText(await overrideFile.text(), overrideFile.name) : undefined,
    names: json.map((file) => file.name),
  }
}

/** A paste is always the policy itself. Overrides come with a drop or from GitHub. */
export const readPasted = (text: string): PolicyFiles => ({
  policy: parsePolicyText(text, 'The pasted text'),
  override: undefined,
})
