import './ui/styles.css'
import { renderLanding } from './ui/landing.ts'
import { initLoading } from './ui/load.ts'
import { initTheme } from './ui/theme.ts'

initTheme(document.querySelector<HTMLButtonElement>('#theme'))

const app = document.querySelector<HTMLElement>('#app')
if (app) {
  const params = new URLSearchParams(location.search)
  // A deep link loads straight away, so it skips the landing.
  if (!params.has('repo') && !params.has('fixture')) app.replaceChildren(renderLanding())
  const loader = initLoading(app)
  if (import.meta.env.DEV) {
    const fixture = params.get('fixture')
    if (fixture) {
      import('./dev.ts')
        .then(({ loadFixture }) => loadFixture(fixture))
        .then(({ label, policy, override }) => loader.show({ policy, override }, label))
        .catch(loader.fail)
    }
  }
}
