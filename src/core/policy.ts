// Policy files are untrusted input: any repo, any paste. Keys go into Maps and
// never onto plain objects, so a key like "__proto__" stays a plain string.

/** One resource, as a single policy file describes it. */
export interface ResourcePolicy {
  /** `globals` as written: key → raw value. Absent if the file has none. */
  readonly globals?: ReadonlyMap<string, unknown>
  /** Uses Node-only fields (`builtin`, `native`), which the board does not show. */
  readonly node: boolean
}

export interface Policy {
  readonly resources: ReadonlyMap<string, ResourcePolicy>
}

/** The file is not a LavaMoat policy. The message is meant for the user. */
export class PolicyFormatError extends Error {
  override name = 'PolicyFormatError'
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Reads a parsed policy.json or policy-override.json. `label` names it in errors. */
export const parsePolicy = (json: unknown, label: string): Policy => {
  const resourcesJson = isRecord(json) ? json.resources : undefined
  if (!isRecord(resourcesJson)) {
    throw new PolicyFormatError(`${label} has no "resources" object, so it is not a LavaMoat policy.`)
  }
  const resources = new Map<string, ResourcePolicy>()
  for (const [id, resource] of Object.entries(resourcesJson)) {
    if (!isRecord(resource)) {
      throw new PolicyFormatError(`${label}: resource "${id}" is not an object.`)
    }
    const { globals } = resource
    if (globals !== undefined && !isRecord(globals)) {
      throw new PolicyFormatError(`${label}: "globals" of resource "${id}" is not an object.`)
    }
    resources.set(id, {
      ...(globals === undefined ? {} : { globals: new Map(Object.entries(globals)) }),
      node: 'builtin' in resource || 'native' in resource,
    })
  }
  return { resources }
}

export const parsePolicyText = (text: string, label: string): Policy => {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new PolicyFormatError(`${label} is not valid JSON: ${reason}`)
  }
  return parsePolicy(json, label)
}
