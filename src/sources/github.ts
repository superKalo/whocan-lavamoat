// Policies from a public GitHub repository, fetched straight from the browser.
// At most two API calls, out of 60 an hour without a token: resolve the
// commit, then list the tree. Files come from raw.githubusercontent.com, which
// does not count against that limit.
import { parsePolicyText, type Policy } from '../core/policy.ts'
import { SourceError } from './source.ts'

export interface Repo {
  readonly owner: string
  readonly name: string
  /** Branch, tag or commit. The default branch when absent. */
  readonly ref?: string
  /** A policy.json the link pointed at. */
  readonly policy?: string
  /** A folder the link pointed at: only policies under it are listed. */
  readonly dir?: string
}

/** Folders whose policy.json and override are the same files. */
export interface PolicyGroup {
  readonly dirs: readonly string[]
  readonly policyPath: string
  /** `null` when the folder has no override. */
  readonly overridePath: string | null
}

interface TreeEntry {
  readonly path: string
  readonly type: string
  readonly sha: string
}

const NAME_CHARS = new Set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.')
const HEX = new Set('0123456789abcdef')

const isName = (s: string): boolean => s.length > 0 && [...s].every((c) => NAME_CHARS.has(c))
export const isFullSha = (s: string): boolean => s.length === 40 && [...s.toLowerCase()].every((c) => HEX.has(c))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isTreeEntry = (value: unknown): value is TreeEntry =>
  isRecord(value) && typeof value.path === 'string' && typeof value.type === 'string' && typeof value.sha === 'string'

const dirOf = (path: string): string => path.split('/').slice(0, -1).join('/')
const isLavamoatDir = (dir: string): boolean => dir.split('/').includes('lavamoat')

export const repoLabel = (repo: Repo): string => `${repo.owner}/${repo.name}${repo.ref ? `@${repo.ref}` : ''}`

/**
 * Reads "owner/repo", "owner/repo@ref" or a GitHub link, including a link to a
 * policy file or a folder. Undefined when it is none of these.
 */
export const parseRepo = (input: string): Repo | undefined => {
  let rest = input.trim().split('#')[0]?.split('?')[0] ?? ''
  for (const prefix of ['https://', 'http://', 'www.', 'github.com/']) {
    if (rest.startsWith(prefix)) rest = rest.slice(prefix.length)
  }
  // Split off "@ref" first: a branch name may contain slashes.
  const at = rest.indexOf('@')
  const atRef = at === -1 ? '' : rest.slice(at + 1)
  if (at !== -1) rest = rest.slice(0, at)

  const [owner = '', rawName = '', kind, urlRef, ...path] = rest.split('/').filter((part) => part !== '')
  const name = rawName.endsWith('.git') ? rawName.slice(0, -'.git'.length) : rawName
  if (!isName(owner) || !isName(name)) return undefined

  if ((kind === 'tree' || kind === 'blob') && urlRef) {
    const file = path.at(-1)
    if (kind === 'blob' && (file === 'policy.json' || file === 'policy-override.json')) {
      return { owner, name, ref: urlRef, policy: [...path.slice(0, -1), 'policy.json'].join('/') }
    }
    return { owner, name, ref: urlRef, ...(path.length > 0 ? { dir: path.join('/') } : {}) }
  }
  return atRef ? { owner, name, ref: atRef } : { owner, name }
}

/** The shareable link for what is on screen. A full SHA plus a path needs no API call. */
export const deepLink = (repo: Repo, sha: string, policyPath?: string): string => {
  const policy = policyPath ? `&policy=${policyPath.split('/').map(encodeURIComponent).join('/')}` : ''
  return `?repo=${repo.owner}/${repo.name}@${sha}${policy}`
}

const apiError = (response: Response, what: string): SourceError => {
  const { status, headers } = response
  if ((status === 403 || status === 429) && headers.get('x-ratelimit-remaining') === '0') {
    const reset = Number(headers.get('x-ratelimit-reset'))
    const when =
      reset > 0
        ? `They reset at ${new Date(reset * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
        : 'They reset within the hour.'
    return new SourceError(
      `GitHub allows 60 requests an hour without signing in, and they are used up. ${when} Meanwhile, drop the files, or use a link with a full commit SHA and a policy path.`,
    )
  }
  if (status === 404) return new SourceError(`${what}: not found. The repository may be private or misspelled.`)
  if (status === 422) return new SourceError(`${what}: no such branch, tag or commit.`)
  return new SourceError(`${what}: GitHub answered ${status}.`)
}

const api = async (url: string, accept: string, what: string): Promise<Response> => {
  let response: Response
  try {
    response = await fetch(url, { headers: { accept } })
  } catch {
    // A rate-limited answer may lack CORS headers and look like this too.
    throw new SourceError(`Could not reach GitHub for ${what}. Check the connection, or the hourly limit may be used up.`)
  }
  if (!response.ok) throw apiError(response, what)
  return response
}

/** The full commit SHA for the ref, so everything after is pinned. No request if the ref is one already. */
export const resolveCommit = async (repo: Repo): Promise<string> => {
  if (repo.ref && isFullSha(repo.ref)) return repo.ref.toLowerCase()
  const url = `https://api.github.com/repos/${repo.owner}/${repo.name}/commits/${encodeURIComponent(repo.ref ?? 'HEAD')}`
  const sha = (await (await api(url, 'application/vnd.github.sha', repoLabel(repo))).text()).trim()
  if (!isFullSha(sha)) throw new SourceError(`${repoLabel(repo)}: GitHub did not return a commit.`)
  return sha
}

/**
 * Groups the policy.json files under a "lavamoat" folder with their
 * overrides, merging folders whose two files are identical.
 */
export const findPolicies = (tree: readonly TreeEntry[], within?: string): PolicyGroup[] => {
  const blobs = new Map(tree.filter((entry) => entry.type === 'blob').map((entry) => [entry.path, entry.sha]))
  const groups = new Map<string, { dir: string; overridePath: string | null }[]>()
  for (const [path, sha] of blobs) {
    if (!path.endsWith('/policy.json')) continue
    const dir = dirOf(path)
    const segments = dir.split('/')
    if (!segments.includes('lavamoat') || segments.includes('node_modules')) continue
    if (within && dir !== within && !dir.startsWith(`${within}/`)) continue
    // The old browserify layout keeps one override for several builds, one folder up.
    const overridePath =
      [dir, dirOf(dir)]
        .filter(isLavamoatDir)
        .map((d) => `${d}/policy-override.json`)
        .find((p) => blobs.has(p)) ?? null
    const key = `${sha}:${overridePath === null ? '' : blobs.get(overridePath)}`
    groups.set(key, [...(groups.get(key) ?? []), { dir, overridePath }])
  }
  return [...groups.values()]
    .map((members) => members.sort((a, b) => (a.dir < b.dir ? -1 : 1)))
    .flatMap(([first, ...others]) =>
      first
        ? [{ dirs: [first.dir, ...others.map((m) => m.dir)], policyPath: `${first.dir}/policy.json`, overridePath: first.overridePath }]
        : [],
    )
    .sort((a, b) => (a.policyPath < b.policyPath ? -1 : 1))
}

export const listPolicies = async (repo: Repo, sha: string): Promise<PolicyGroup[]> => {
  const url = `https://api.github.com/repos/${repo.owner}/${repo.name}/git/trees/${sha}?recursive=1`
  const body: unknown = await (await api(url, 'application/vnd.github+json', repoLabel(repo))).json()
  const tree = isRecord(body) && Array.isArray(body.tree) ? body.tree.filter(isTreeEntry) : []
  const groups = findPolicies(tree, repo.dir)
  if (groups.length > 0) return groups
  if (isRecord(body) && body.truncated === true) {
    throw new SourceError(
      `${repoLabel(repo)} has too many files to list. Link straight to the policy instead, like github.com/${repo.owner}/${repo.name}/blob/<branch>/lavamoat/webpack/policy.json.`,
    )
  }
  throw new SourceError(`${repoLabel(repo)} has no LavaMoat policy, that is no policy.json under a lavamoat folder.`)
}

/** A file at a commit, from raw.githubusercontent.com, or from jsDelivr when raw is rate limited. Undefined if missing. */
const fetchFile = async (repo: Repo, sha: string, path: string): Promise<string | undefined> => {
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  const urls = [
    `https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${sha}/${encoded}`,
    `https://cdn.jsdelivr.net/gh/${repo.owner}/${repo.name}@${sha}/${encoded}`,
  ]
  let failure = 'no answer'
  for (const url of urls) {
    let response: Response
    try {
      response = await fetch(url)
    } catch {
      continue
    }
    if (response.ok) return response.text()
    if (response.status === 404) return undefined
    failure = String(response.status)
    if (response.status !== 429) break
  }
  throw new SourceError(`Could not download ${path} (${failure}).`)
}

export const fetchPolicy = async (repo: Repo, sha: string, path: string): Promise<Policy> => {
  const text = await fetchFile(repo, sha, path)
  if (text === undefined) throw new SourceError(`${path} is not in ${repoLabel(repo)} at ${sha.slice(0, 7)}.`)
  return parsePolicyText(text, path)
}

/**
 * The override for a policy. From a tree listing the path is known, `null`
 * meaning none; from a deep link it is not, so the same folder is tried, then
 * the one above it.
 */
export const fetchOverride = async (
  repo: Repo,
  sha: string,
  policyPath: string,
  overridePath: string | null | undefined,
): Promise<Policy | undefined> => {
  if (overridePath === null) return undefined
  const dir = dirOf(policyPath)
  const candidates = overridePath
    ? [overridePath]
    : [dir, dirOf(dir)].filter(isLavamoatDir).map((d) => `${d}/policy-override.json`)
  for (const candidate of candidates) {
    const text = await fetchFile(repo, sha, candidate)
    if (text !== undefined) return parsePolicyText(text, candidate)
  }
  return undefined
}
