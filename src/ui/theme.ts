// Dark by default, like the slides. The choice is remembered per browser.
type Theme = 'dark' | 'light'

const KEY = 'whocan-theme'

const stored = (): Theme | undefined => {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'dark' || value === 'light' ? value : undefined
  } catch {
    return undefined
  }
}

export const initTheme = (button: HTMLButtonElement | null): void => {
  const apply = (theme: Theme): void => {
    document.documentElement.dataset.theme = theme
    if (!button) return
    const other = theme === 'dark' ? 'light' : 'dark'
    button.textContent = other === 'light' ? 'Light' : 'Dark'
    button.setAttribute('aria-label', `Switch to the ${other} theme`)
  }
  apply(stored() ?? 'dark')
  button?.addEventListener('click', () => {
    const next: Theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'
    apply(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // Storage blocked (private mode): the theme still switches for this page.
    }
  })
}
