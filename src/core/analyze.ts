import { categories, type Category } from './categories.ts'
import { mergePolicy } from './mergePolicy.ts'
import type { Policy } from './policy.ts'

export type MatchState = 'explicit' | 'inherited'

export interface CardMatch {
  readonly state: MatchState
  /** Policy keys behind the match, as written in the file. */
  readonly grants: readonly string[]
  /** Overwrite card only: written key → number of other resources reading it. */
  readonly readers?: ReadonlyMap<string, number>
}

export interface Card {
  readonly category: Category
  /** Resource id → match. Resources without access are absent. */
  readonly matches: ReadonlyMap<string, CardMatch>
  readonly explicit: number
  readonly inherited: number
}

export type WarningCode =
  | 'alias-no-effect'
  | 'alias-prefix-no-effect'
  | 'ignored-denial'
  | 'hierarchy'
  | 'nested-write'
  | 'unknown-value'
  | 'proto-key'
  | 'dangerous-global'

export interface Warning {
  readonly code: WarningCode
  /** 'info' for grants that do nothing but are harmless. */
  readonly severity: 'info' | 'warning'
  readonly resource: string
  readonly key: string
  readonly message: string
}

export interface Report {
  /** Resource ids, sorted: one dot each, at the same spot on every card. */
  readonly resources: readonly string[]
  readonly cards: readonly Card[]
  readonly warnings: readonly Warning[]
  /** Some resource uses Node-only fields (`builtin`, `native`), which the board does not show. */
  readonly node: boolean
}

// The @lavamoat/webpack runtime points these at the package's own global, so a
// grant on them, or under them, gives nothing.
const OWN_GLOBAL_ALIASES = new Set(['window', 'self', 'global', 'globalThis', 'frames'])
// Not aliased by the runtime: "top" alone is the real window, while "top.x"
// hands over only x.
const REAL_WINDOW_REFS = new Set(['top', 'parent'])
// Copied from the root compartment, which likely escapes the sandbox.
const SANDBOX_INTRINSICS = new Set(['eval', 'Function', 'Compartment'])

interface Grant {
  /** Key as written in the policy. */
  readonly key: string
  /** What the package gets, with a leading `top.` or `parent.` removed. */
  readonly path: string
  /** A top-level `"write"`. */
  readonly write: boolean
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** Turns a resource's merged globals into grants, and notes what LavaMoat would do differently. */
const collectGrants = (
  resource: string,
  globals: ReadonlyMap<string, unknown> | undefined,
  warnings: Warning[],
): Grant[] => {
  const grants: Grant[] = []
  for (const [key, value] of globals ?? []) {
    if (value === false) continue
    const warn = (code: WarningCode, message: string, severity: Warning['severity'] = 'warning') =>
      warnings.push({ code, severity, resource, key, message })

    if (value !== true && value !== 'write') {
      warn('unknown-value', `LavaMoat throws at runtime: ${JSON.stringify(value)} is not a valid value. Use true, false or "write".`)
      continue
    }
    const [head = '', ...rest] = key.split('.')
    if (key.split('.').includes('__proto__')) {
      warn('proto-key', 'LavaMoat throws at runtime: "__proto__" is not allowed in a global path.')
      continue
    }
    if (OWN_GLOBAL_ALIASES.has(head)) {
      if (rest.length === 0) {
        warn('alias-no-effect', `No effect: inside a compartment "${key}" is the package's own global.`, 'info')
      } else {
        warn('alias-prefix-no-effect', `No effect. Did you mean "${rest.join('.')}"?`)
      }
      continue
    }
    if (value === 'write' && rest.length > 0) {
      warn('nested-write', 'LavaMoat throws at runtime: "write" is only allowed on top-level globals.')
    }
    if (SANDBOX_INTRINSICS.has(head)) {
      warn('dangerous-global', `"${head}" comes from the root compartment and probably lets the package escape the sandbox.`)
    }
    const path = REAL_WINDOW_REFS.has(head) && rest.length > 0 ? rest.join('.') : key
    grants.push({ key, path, write: value === 'write' && rest.length === 0 })
  }
  return grants
}

const isAtOrUnder = (path: string, target: string): boolean => path === target || path.startsWith(`${target}.`)

/** Explicit: a grant at or under a target. Inherited: a grant above one, like `navigator` for `navigator.hid`. */
const matchTargets = (grants: readonly Grant[], targets: readonly string[]): CardMatch | undefined => {
  const explicit = grants.filter((g) => targets.some((t) => isAtOrUnder(g.path, t)))
  if (explicit.length > 0) return { state: 'explicit', grants: explicit.map((g) => g.key) }
  const inherited = grants.filter((g) => targets.some((t) => t.startsWith(`${g.path}.`)))
  if (inherited.length > 0) return { state: 'inherited', grants: inherited.map((g) => g.key) }
  return undefined
}

/**
 * A write counts only if another resource reads the same top-level key: the
 * runtime shares the written value with every package granted that key.
 */
const matchWrites = (
  resource: string,
  grants: readonly Grant[],
  readers: ReadonlyMap<string, ReadonlySet<string>>,
): CardMatch | undefined => {
  const shared = new Map<string, number>()
  for (const grant of grants) {
    if (!grant.write) continue
    const others = [...(readers.get(grant.path) ?? [])].filter((reader) => reader !== resource).length
    if (others > 0) shared.set(grant.key, others)
  }
  return shared.size === 0 ? undefined : { state: 'explicit', grants: [...shared.keys()], readers: shared }
}

/** Reaches something on a reach card and can fetch. Explicit only if both sides are. */
const matchHero = (resource: string, reach: readonly Card[], send: Card | undefined): CardMatch | undefined => {
  const sent = send?.matches.get(resource)
  const reached = reach.flatMap((card) => card.matches.get(resource) ?? [])
  if (!sent || reached.length === 0) return undefined
  const explicit = sent.state === 'explicit' && reached.some((m) => m.state === 'explicit')
  return {
    state: explicit ? 'explicit' : 'inherited',
    grants: [...new Set([...reached.flatMap((m) => m.grants), ...sent.grants])],
  }
}

const makeCard = (
  category: Category,
  resources: readonly string[],
  match: (resource: string) => CardMatch | undefined,
): Card => {
  const matches = new Map<string, CardMatch>()
  for (const resource of resources) {
    const found = match(resource)
    if (found) matches.set(resource, found)
  }
  const count = (state: MatchState) => [...matches.values()].filter((m) => m.state === state).length
  return { category, matches, explicit: count('explicit'), inherited: count('inherited') }
}

/** Resources in policy.json, plus override-only ones that grant at least one global. */
const resourceIds = (policy: Policy, override: Policy | undefined): string[] => {
  const ids = [...policy.resources.keys()]
  for (const [id, resource] of override?.resources ?? []) {
    if (policy.resources.has(id)) continue
    if ([...(resource.globals?.values() ?? [])].some((v) => v === true || v === 'write')) ids.push(id)
  }
  return ids.sort(compare)
}

export const analyze = (policy: Policy, override?: Policy): Report => {
  const merged = mergePolicy(policy, override)
  const warnings: Warning[] = [
    ...merged.violations.map(({ resource, path, parent }): Warning => ({
      code: 'hierarchy',
      severity: 'warning',
      resource,
      key: path,
      message: `LavaMoat fails the build here: "${path}" is granted under "${parent}", which is granted too.`,
    })),
    ...merged.ignoredDenials.map(({ resource, path, parent }): Warning => ({
      code: 'ignored-denial',
      severity: 'warning',
      resource,
      key: path,
      message: `No effect: LavaMoat drops "${path}": false because "${parent}" is granted. Deny "${parent}" and grant only the parts you need.`,
    })),
  ]

  const resources = resourceIds(policy, override)
  const grants = new Map(
    resources.map((id) => [id, collectGrants(id, merged.policy.resources.get(id)?.globals, warnings)] as const),
  )
  const grantsOf = (id: string): readonly Grant[] => grants.get(id) ?? []

  // Top-level key → resources granted anything under it, i.e. who reads a write.
  const readers = new Map<string, Set<string>>()
  for (const [id, list] of grants) {
    for (const { path } of list) {
      const head = path.split('.')[0] ?? path
      const set = readers.get(head) ?? new Set<string>()
      readers.set(head, set.add(id))
    }
  }

  const cards = new Map<string, Card>()
  for (const category of categories) {
    if (category.id === 'hero') continue
    const match =
      category.id === 'overwrite'
        ? (id: string) => matchWrites(id, grantsOf(id), readers)
        : (id: string) => matchTargets(grantsOf(id), category.targets)
    cards.set(category.id, makeCard(category, resources, match))
  }
  const reach = [...cards.values()].filter((card) => card.category.row === 'reach')
  for (const category of categories) {
    if (category.id !== 'hero') continue
    cards.set(category.id, makeCard(category, resources, (id) => matchHero(id, reach, cards.get('fetch'))))
  }

  return {
    resources,
    cards: categories.flatMap((category) => cards.get(category.id) ?? []),
    warnings: warnings.sort(
      (a, b) => compare(a.resource, b.resource) || compare(a.key, b.key) || compare(a.code, b.code),
    ),
    node: [...merged.policy.resources.values()].some((resource) => resource.node),
  }
}
