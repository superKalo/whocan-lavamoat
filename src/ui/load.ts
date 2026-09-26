import { analyze } from '../core/analyze.ts'
import type { Policy } from '../core/policy.ts'
import { readFiles, readPasted } from '../sources/file.ts'
import {
  deepLink,
  fetchOverride,
  fetchPolicy,
  listPolicies,
  parseRepo,
  repoLabel,
  resolveCommit,
  type PolicyGroup,
  type Repo,
} from '../sources/github.ts'
import type { PolicyFiles } from '../sources/source.ts'
import { plural, renderReport } from './board.ts'
import { h } from './dom.ts'
import { icon } from './icons.ts'
import { attachInteractions } from './interactions.ts'

export interface Loader {
  /** Draws the board for a policy. `label` says where it came from. */
  readonly show: (files: PolicyFiles, label: Node | string) => void
  readonly fail: (error: unknown) => void
}

/** A policy to open. Without a known override path, the override is looked up. */
interface Target {
  readonly dirs: readonly string[]
  readonly policyPath: string
  readonly overridePath?: string | null
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const folderOf = (path: string): string => path.split('/').slice(0, -1).join('/')

/** "lavamoat/webpack/mv3/{beta, flask, main}" for folders under one parent. */
const groupLabel = (dirs: readonly string[]): string => {
  const parents = new Set(dirs.map(folderOf))
  const [parent] = parents
  if (dirs.length === 1 || parents.size !== 1 || parent === undefined) return dirs.join(', ')
  return `${parent}/{${dirs.map((dir) => dir.split('/').at(-1)).join(', ')}}`
}

const summarize = (group: PolicyGroup, policy: Policy): string =>
  [
    plural(policy.resources.size, 'package'),
    group.dirs.length > 1 ? `the same in ${group.dirs.length} folders` : '',
    [...policy.resources.values()].some((resource) => resource.node) ? 'Node policies are not supported yet' : '',
  ]
    .filter(Boolean)
    .join(' · ')

/** Wires the repo form, drag and drop, paste, the file picker and deep links. */
export const initLoading = (app: HTMLElement): Loader => {
  const form = document.querySelector<HTMLFormElement>('#repo-form')
  const input = document.querySelector<HTMLInputElement>('#repo')
  const fileInput = document.querySelector<HTMLInputElement>('#files')
  const status = document.querySelector<HTMLElement>('#status')
  // Each load takes a number, so an older, slower load cannot replace a newer one.
  let latest = 0

  const setStatus = (text: string, kind?: 'busy' | 'error'): void => {
    if (!status) return
    status.textContent = text
    status.className = kind ? `status ${kind}` : 'status'
  }
  const setLink = (search: string): void => history.replaceState(null, '', `${location.pathname}${search}`)

  const show = (files: PolicyFiles, label: Node | string): void => {
    const report = analyze(files.policy, files.override)
    const view = renderReport(report, label)
    app.replaceChildren(view)
    attachInteractions(view, report)
    setStatus('')
  }
  const fail = (error: unknown): void => setStatus(messageOf(error), 'error')

  const load = async (task: (isCurrent: () => boolean) => Promise<void>): Promise<void> => {
    const id = ++latest
    const isCurrent = () => id === latest
    try {
      await task(isCurrent)
    } catch (error) {
      if (isCurrent()) fail(error)
    }
  }

  const repoSource = (repo: Repo, sha: string, dir: string, back?: () => void): Node => {
    const link = h(
      'a',
      { href: `https://github.com/${repo.owner}/${repo.name}/tree/${sha}/${dir}`, target: '_blank', rel: 'noopener noreferrer' },
      `${repo.owner}/${repo.name}`,
    )
    const other = back ? h('button', { type: 'button', class: 'link' }, 'other policies') : null
    if (other && back) other.addEventListener('click', back)
    return h('span', {}, link, ' @ ', h('code', {}, sha.slice(0, 7)), ' · ', h('code', {}, dir), ...(other ? [' · ', other] : []))
  }

  const open = async (
    repo: Repo,
    sha: string,
    target: Target,
    isCurrent: () => boolean,
    policy?: Policy,
    back?: () => void,
  ): Promise<void> => {
    setStatus(`Downloading ${target.policyPath}…`, 'busy')
    const loaded = policy ?? (await fetchPolicy(repo, sha, target.policyPath))
    const override = await fetchOverride(repo, sha, target.policyPath, target.overridePath)
    if (!isCurrent()) return
    show({ policy: loaded, override }, repoSource(repo, sha, target.dirs[0] ?? '', back))
    setLink(deepLink(repo, sha, target.policyPath))
  }

  const pick = async (repo: Repo, sha: string, groups: readonly PolicyGroup[], isCurrent: () => boolean): Promise<void> => {
    setStatus(`Reading ${plural(groups.length, 'policy', 'policies')}…`, 'busy')
    const results = await Promise.allSettled(groups.map((group) => fetchPolicy(repo, sha, group.policyPath)))
    if (!isCurrent()) return
    const render = (): void => {
      setLink(deepLink(repo, sha))
      setStatus('')
      const items = groups.map((group, i) => {
        const result = results[i]
        const policy = result?.status === 'fulfilled' ? result.value : undefined
        const button = h(
          'button',
          { type: 'button', class: 'picker-row', disabled: !policy },
          icon('file-directory'),
          h('code', {}, groupLabel(group.dirs)),
          h(
            'span',
            { class: 'meta' },
            policy ? summarize(group, policy) : `Could not read it: ${messageOf(result?.status === 'rejected' ? result.reason : '')}`,
          ),
        )
        button.addEventListener('click', () => void load((current) => open(repo, sha, group, current, policy, render)))
        return h('li', {}, button)
      })
      app.replaceChildren(
        h(
          'section',
          { class: 'box picker' },
          h(
            'h2',
            { class: 'box-header' },
            `${plural(groups.length, 'policy', 'policies')} in ${repo.owner}/${repo.name} @ ${sha.slice(0, 7)}. Pick one:`,
          ),
          h('ul', {}, ...items),
        ),
      )
    }
    render()
  }

  const loadRepo = (repo: Repo, policyPath?: string): Promise<void> =>
    load(async (isCurrent) => {
      setStatus(`Looking up ${repoLabel(repo)}…`, 'busy')
      const sha = await resolveCommit(repo)
      if (!isCurrent()) return
      const path = policyPath ?? repo.policy
      if (path) return open(repo, sha, { dirs: [folderOf(path)], policyPath: path }, isCurrent)
      setStatus(`Listing the files of ${repoLabel(repo)}…`, 'busy')
      const groups = await listPolicies(repo, sha)
      if (!isCurrent()) return
      const [only] = groups
      return only && groups.length === 1 ? open(repo, sha, only, isCurrent) : pick(repo, sha, groups, isCurrent)
    })

  const loadFiles = (files: readonly File[]): Promise<void> =>
    load(async (isCurrent) => {
      const loaded = await readFiles(files)
      if (!isCurrent()) return
      show(loaded, loaded.names.join(' + '))
      setLink('')
    })

  form?.addEventListener('submit', (event) => {
    event.preventDefault()
    const repo = parseRepo(input?.value ?? '')
    if (repo) void loadRepo(repo)
    else fail(new Error('Type owner/repo, like AmbireTech/extension, or paste a GitHub link.'))
  })

  document.querySelector('#choose')?.addEventListener('click', () => fileInput?.click())
  fileInput?.addEventListener('change', () => {
    void loadFiles([...(fileInput.files ?? [])])
    fileInput.value = ''
  })

  const hasFiles = (event: DragEvent): boolean => event.dataTransfer?.types.includes('Files') ?? false
  document.addEventListener('dragover', (event) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    document.body.classList.add('dragging')
  })
  document.addEventListener('dragleave', (event) => {
    if (event.relatedTarget === null) document.body.classList.remove('dragging')
  })
  document.addEventListener('drop', (event) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    document.body.classList.remove('dragging')
    void loadFiles([...(event.dataTransfer?.files ?? [])])
  })

  document.addEventListener('paste', (event) => {
    if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable]')) return
    const text = event.clipboardData?.getData('text') ?? ''
    if (text.trim() === '') return
    event.preventDefault()
    void load(async () => {
      show(readPasted(text), 'pasted policy')
      setLink('')
    })
  })

  const params = new URLSearchParams(location.search)
  const linked = parseRepo(params.get('repo') ?? '')
  if (linked) {
    if (input) input.value = repoLabel(linked)
    void loadRepo(linked, params.get('policy') ?? undefined)
  }

  return { show, fail }
}
