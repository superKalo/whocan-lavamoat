import type { Policy } from '../core/policy.ts'

/** Getting the files failed. The message is meant for the user. */
export class SourceError extends Error {
  override name = 'SourceError'
}

/** A policy ready to analyze, with its override if there is one. */
export interface PolicyFiles {
  readonly policy: Policy
  readonly override: Policy | undefined
}
