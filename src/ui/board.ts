import type { Card, Report, Warning } from '../core/analyze.ts'
import type { Row } from '../core/categories.ts'
import { h, s } from './dom.ts'
import { icon } from './icons.ts'

/** One dot's cell, in viewBox units. */
export const CELL = 10

export interface Grid {
  readonly cols: number
  readonly rows: number
}

/** About 16:9, and the same on every card. */
export const gridFor = (count: number): Grid => {
  const cols = Math.max(1, Math.ceil(Math.sqrt((count * 16) / 9)))
  return { cols, rows: Math.max(1, Math.ceil(count / cols)) }
}

/** Center of dot `i`. Resources keep their index on every card. */
export const dotCenter = (i: number, grid: Grid): { x: number; y: number } => ({
  x: (i % grid.cols) * CELL + CELL / 2,
  y: Math.floor(i / grid.cols) * CELL + CELL / 2,
})

/** One card's dots: filled for explicit, a ring for inherited, dim for none. */
export const drawDots = (card: Card, resources: readonly string[], grid: Grid): SVGSVGElement => {
  const dim = s('g', { class: 'dim' })
  const ring = s('g', { class: 'ring' })
  const fill = s('g', { class: 'fill' })
  resources.forEach((id, i) => {
    const { x, y } = dotCenter(i, grid)
    const state = card.matches.get(id)?.state
    if (state === 'explicit') fill.append(s('circle', { cx: x, cy: y, r: 3.4 }))
    else if (state === 'inherited') ring.append(s('circle', { cx: x, cy: y, r: 2.8 }))
    else dim.append(s('circle', { cx: x, cy: y, r: 2 }))
  })
  const svg = s('svg', { class: 'dots', viewBox: `0 0 ${grid.cols * CELL} ${grid.rows * CELL}` }, dim, ring, fill)
  // CSS caps the cell size with it, so a small policy does not get giant dots.
  svg.style.setProperty('--cols', String(grid.cols))
  return svg
}

export const plural = (n: number, word: string, many = `${word}s`): string => `${n} ${n === 1 ? word : many}`

/** "21 packages, 8 more via broad grants" */
export const describeCounts = (card: Card): string =>
  plural(card.explicit, 'package') + (card.inherited > 0 ? `, ${card.inherited} more via broad grants` : '')

const renderCard = (card: Card, resources: readonly string[], grid: Grid): HTMLElement => {
  const { category, explicit, inherited } = card
  const total = resources.length
  return h(
    'article',
    { class: `card card-${category.row}`, 'data-card': category.id },
    h(
      'button',
      {
        type: 'button',
        class: 'card-head',
        'aria-haspopup': 'dialog',
        'aria-label': `${category.title} ${describeCounts(card)}, out of ${total}. Show the list.`,
      },
      h('span', { class: 'card-title' }, category.title),
      h('span', { class: 'card-subtitle' }, category.subtitle),
      h(
        'span',
        { class: explicit + inherited === 0 ? 'card-score clear' : 'card-score' },
        h('span', { class: 'card-count' }, String(explicit)),
        h('span', { class: 'card-total' }, `/ ${total}`),
      ),
      inherited > 0 ? h('span', { class: 'label' }, `+${inherited} via broad grants`) : null,
    ),
    drawDots(card, resources, grid),
  )
}

const ROWS: readonly { readonly row: Row; readonly label?: string }[] = [
  { row: 'hero' },
  { row: 'reach', label: 'What a package can reach' },
  { row: 'send', label: 'How it gets out' },
]

/** A Primer flash, collapsed so the board stays on top. */
const renderWarnings = (warnings: readonly Warning[]): HTMLElement | null => {
  if (warnings.length === 0) return null
  const serious = warnings.filter((w) => w.severity === 'warning').length
  const notes = warnings.length - serious
  const summary = [serious > 0 ? plural(serious, 'warning') : '', notes > 0 ? plural(notes, 'note') : '']
    .filter(Boolean)
    .join(' and ')
  return h(
    'details',
    { class: serious > 0 ? 'flash flash-attention' : 'flash flash-accent' },
    h('summary', {}, icon(serious > 0 ? 'alert' : 'info'), `${summary} about this policy`),
    h(
      'ul',
      {},
      ...warnings.map((w) =>
        h(
          'li',
          { class: `warning ${w.severity}` },
          h(
            'span',
            { class: 'where' },
            icon(w.severity === 'info' ? 'info' : 'alert'),
            h('code', {}, w.resource),
            h('code', {}, w.key),
          ),
          h('span', { class: 'message' }, w.message),
        ),
      ),
    ),
  )
}

const NOTES = [
  'Counts are what the policy grants directly. A real DOM node leads to the real window, and from there to everything, so every other card is a lower bound.',
  'eval and Function are tamed by SES in every compartment and never appear in a generated policy.',
  'Modules excluded from LavaMoat and entry points built without it are not in the policy, but they have full access.',
  'One policy covers every context, such as the service worker and the UI, but not every context has every global.',
  'Access through packages, like importing a package that can fetch, is not counted.',
]

const NODE_NOTE = 'This policy also has Node-only fields (builtin, native), which the board does not show yet.'

const renderNotes = (report: Report): HTMLElement =>
  h(
    'section',
    { class: 'box notes' },
    h('h3', { class: 'box-header' }, 'What the numbers leave out'),
    h('ul', {}, ...(report.node ? [NODE_NOTE, ...NOTES] : NOTES).map((note) => h('li', {}, note))),
  )

/** The whole board for one report. `label` says which policy it is. */
export const renderReport = (report: Report, label: Node | string): HTMLElement => {
  const grid = gridFor(report.resources.length)
  const rows = ROWS.map(({ row, label: rowLabel }) =>
    h(
      'section',
      { class: `row row-${row}` },
      rowLabel ? h('h3', { class: 'row-title' }, rowLabel) : null,
      h(
        'div',
        { class: 'cards' },
        ...report.cards
          .filter((card) => card.category.row === row)
          .map((card) => renderCard(card, report.resources, grid)),
      ),
    ),
  )
  return h(
    'div',
    { class: 'report' },
    h(
      'header',
      { class: 'report-head' },
      h(
        'div',
        {},
        h('h2', { class: 'headline' }, plural(report.resources.length, 'package')),
        h('p', { class: 'lede' }, 'What each one is allowed to touch, capability by capability.'),
        h('p', { class: 'source' }, typeof label === 'string' ? h('code', {}, label) : label),
      ),
      h(
        'div',
        { class: 'export', role: 'group', 'aria-label': 'Download the board' },
        h('button', { type: 'button', class: 'button', 'data-export': 'svg' }, icon('download'), 'SVG'),
        h('button', { type: 'button', class: 'button', 'data-export': 'png' }, icon('download'), 'PNG'),
      ),
    ),
    renderWarnings(report.warnings),
    h('div', { class: 'board' }, ...rows),
    renderNotes(report),
  )
}
