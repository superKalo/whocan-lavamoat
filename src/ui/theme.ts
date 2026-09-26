// The page follows the system theme in CSS (light-dark() in styles.css), so
// nothing flashes on load. The button overrides it until the system theme
// changes; from then on the page follows the system again.
import { icon } from './icons.ts'

type Theme = 'dark' | 'light'

/** A choice made with the button, and the system theme at that moment. */
interface Override {
  readonly theme: Theme
  readonly system: Theme
}

const KEY = 'whocan-theme'
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

const systemTheme = (): Theme => (darkQuery.matches ? 'dark' : 'light')
const isTheme = (value: unknown): value is Theme => value === 'dark' || value === 'light'

const readOverride = (): Override | undefined => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (typeof value === 'object' && value !== null && 'theme' in value && 'system' in value) {
      const { theme, system } = value
      if (isTheme(theme) && isTheme(system)) return { theme, system }
    }
  } catch {
    // Blocked storage or an old value: follow the system.
  }
  return undefined
}

const writeOverride = (override: Override | undefined): void => {
  try {
    if (override) localStorage.setItem(KEY, JSON.stringify(override))
    else localStorage.removeItem(KEY)
  } catch {
    // Blocked storage (private mode): the choice lasts for this page only.
  }
}

export const initTheme = (button: HTMLButtonElement | null): void => {
  let override = readOverride()
  // The system theme changed while the page was closed.
  if (override && override.system !== systemTheme()) {
    override = undefined
    writeOverride(undefined)
  }

  const render = (): void => {
    const root = document.documentElement
    if (override) root.dataset.theme = override.theme
    else delete root.dataset.theme
    if (!button) return
    const other: Theme = (override?.theme ?? systemTheme()) === 'dark' ? 'light' : 'dark'
    button.replaceChildren(icon(other === 'light' ? 'sun' : 'moon'))
    button.setAttribute('aria-label', `Switch to the ${other} theme`)
    button.title = `Switch to the ${other} theme`
  }

  button?.addEventListener('click', () => {
    const next: Theme = (override?.theme ?? systemTheme()) === 'dark' ? 'light' : 'dark'
    // Choosing what the system already shows is the same as following it.
    override = next === systemTheme() ? undefined : { theme: next, system: systemTheme() }
    writeOverride(override)
    render()
  })
  darkQuery.addEventListener('change', () => {
    override = undefined
    writeOverride(undefined)
    render()
  })
  render()
}
