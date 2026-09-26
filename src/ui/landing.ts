import { categories } from '../core/categories.ts'
import { h, s } from './dom.ts'

// A few lit dots per question, like a tiny board of 4 × 3 packages.
const LIT: Readonly<Record<string, readonly number[]>> = {
  hero: [6],
  chrome: [1],
  storage: [2, 9],
  hardware: [11],
  clipboard: [4],
  fetch: [0, 5, 7, 10],
  escape: [3, 6, 8],
  overwrite: [9],
}

const miniBoard = (id: string): SVGSVGElement => {
  const lit = new Set(LIT[id] ?? [])
  const dots = Array.from({ length: 12 }, (_, i) =>
    s('circle', {
      cx: (i % 4) * 5 + 2.5,
      cy: Math.floor(i / 4) * 5 + 2.5,
      r: lit.has(i) ? 1.8 : 1.2,
      class: lit.has(i) ? 'lit' : undefined,
    }),
  )
  return s('svg', { class: 'mini-board', viewBox: '0 0 20 15', 'aria-hidden': 'true' }, ...dots)
}

// The questions of the cards, for "Who can …?", starting with fetch.
const PHRASES = (() => {
  const phrases = categories.map((category) => category.title.replace(/^who can /, '').replace(/\?$/, ''))
  return ['fetch', ...phrases.filter((phrase) => phrase !== 'fetch')]
})()

/**
 * Cycles the question in "Who can fetch?" while the landing is on screen.
 * Keeping the question mark inside the animated span lets it fade and move with
 * the phrase instead of visibly jumping when the phrase changes width. It stays
 * on "fetch?" for people who prefer reduced motion.
 */
export const rotateCapability = (word: HTMLElement): void => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  let i = 0
  const timer = window.setInterval(() => {
    if (!document.querySelector('.landing')) {
      window.clearInterval(timer)
      word.classList.remove('out')
      word.textContent = 'fetch?'
      return
    }
    word.classList.add('out')
    window.setTimeout(() => {
      i = (i + 1) % PHRASES.length
      word.textContent = `${PHRASES[i] ?? 'fetch'}?`
      word.classList.remove('out')
    }, 250)
  }, 2400)
}

const link = (href: string, text: string): HTMLAnchorElement =>
  h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text)

/** What the page shows before a policy is loaded. */
export const renderLanding = (): HTMLElement =>
  h(
    'div',
    { class: 'landing' },
    h(
      'ul',
      { class: 'questions', 'aria-label': 'What whocan answers' },
      ...categories.map((category) =>
        h('li', { class: `question question-${category.row}` }, miniBoard(category.id), category.title),
      ),
    ),
    h(
      'div',
      { class: 'landing-grid' },
      h(
        'section',
        {},
        h('h2', {}, 'What is LavaMoat?'),
        h(
          'p',
          {},
          'Every npm package in your app runs with your app’s full authority. A dependency of a dependency can read storage, call ',
          h('code', {}, 'chrome.*'),
          ' and send what it finds anywhere, and npm has no way to say “this package can’t fetch”.',
        ),
        h(
          'p',
          {},
          'LavaMoat adds that permission. SES freezes the shared built-ins, and LavaMoat gives each package its own compartment that sees only the globals its policy lists. Everything else is undefined. The policy is generated from your code, not written by hand.',
        ),
        h(
          'ul',
          { class: 'links' },
          h('li', {}, link('https://github.com/LavaMoat/LavaMoat', 'LavaMoat on GitHub')),
          h('li', {}, link('https://lavamoat.github.io/', 'Documentation')),
          h('li', {}, link('https://lavamoat.github.io/guides/policy-diff/', 'Reviewing policy changes')),
          h('li', {}, link('https://hardenedjs.org/', 'Hardened JavaScript (SES)')),
        ),
      ),
      h(
        'section',
        {},
        h('h2', {}, 'Why whocan?'),
        h(
          'p',
          {},
          'The policy is the real attack surface of your app, but it is a long JSON file sorted by package, so nobody reads it. whocan turns it around: one card per capability, one dot per package, lit where the policy lets that package in.',
        ),
        h(
          'p',
          {},
          'It follows LavaMoat’s own rules for overrides, aliases and broad grants, and says what the numbers leave out.',
        ),
        h(
          'p',
          {},
          'It runs in your browser: policies are read locally and never uploaded, and nothing is tracked. whocan is open source under the MIT license.',
        ),
        h('ul', { class: 'links' }, h('li', {}, link('https://github.com/superKalo/whocan-lavamoat', 'Source on GitHub'))),
      ),
    ),
  )
