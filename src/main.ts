import './ui/styles.css'
import { initLoading } from './ui/load.ts'
import { initTheme } from './ui/theme.ts'

initTheme(document.querySelector<HTMLButtonElement>('#theme'))

const app = document.querySelector<HTMLElement>('#app')
if (app) {
  const loader = initLoading(app)
  if (import.meta.env.DEV) {
    const fixture = new URLSearchParams(location.search).get('fixture')
    if (fixture) {
      import('./dev.ts')
        .then(({ loadFixture }) => loadFixture(fixture))
        .then(({ label, policy, override }) => loader.show({ policy, override }, label))
        .catch(loader.fail)
    }
  }
}
