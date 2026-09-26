import './ui/styles.css'
import { analyze } from './core/analyze.ts'
import type { Policy } from './core/policy.ts'
import { renderReport } from './ui/board.ts'
import { h } from './ui/dom.ts'
import { attachInteractions } from './ui/interactions.ts'
import { initTheme } from './ui/theme.ts'

const app = document.querySelector<HTMLElement>('#app')
initTheme(document.querySelector<HTMLButtonElement>('#theme'))

const show = (label: string, policy: Policy, override?: Policy): void => {
  const report = analyze(policy, override)
  const view = renderReport(report, label)
  app?.replaceChildren(view)
  attachInteractions(view, report)
}

const fail = (error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error)
  app?.replaceChildren(h('p', { class: 'error', role: 'alert' }, message))
}

app?.replaceChildren(h('p', { class: 'empty' }, 'Load a LavaMoat policy to see who can do what.'))

if (import.meta.env.DEV) {
  const fixture = new URLSearchParams(location.search).get('fixture')
  if (fixture) {
    import('./dev.ts')
      .then(({ loadFixture }) => loadFixture(fixture))
      .then(({ label, policy, override }) => show(label, policy, override))
      .catch(fail)
  }
}
