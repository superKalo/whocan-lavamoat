import type { Card, CardMatch, Report } from '../core/analyze.ts'
import { CELL, describeCounts, dotCenter, gridFor } from './board.ts'
import { h, s } from './dom.ts'
import { icon } from './icons.ts'

let detach: AbortController | undefined

/** "fetch, XMLHttpRequest", "via navigator" or "console (54 readers)". */
export const describeAccess = (card: Card, match: CardMatch | undefined): string => {
  if (!match) return 'no access'
  if (match.readers) {
    return [...match.readers].map(([key, n]) => `${key} (${n} ${n === 1 ? 'reader' : 'readers'})`).join(', ')
  }
  const grants = match.grants.join(', ')
  return match.state === 'inherited' && card.category.id !== 'hero' ? `via ${grants}` : grants
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Hover, tap or arrow keys on a dot show a tooltip and ring the same package
 * on every card. A card's head opens the full list.
 */
export const attachInteractions = (root: HTMLElement, report: Report): void => {
  detach?.abort()
  detach = new AbortController()
  const { signal } = detach
  const count = report.resources.length
  const grid = gridFor(count)
  const cards = new Map(report.cards.map((card) => [card.category.id, card]))
  const cardOf = (el: Element): Card | undefined => cards.get(el.closest('[data-card]')?.getAttribute('data-card') ?? '')

  const tooltip = h('div', { class: 'tooltip', role: 'tooltip' })
  const live = h('div', { class: 'visually-hidden', 'aria-live': 'polite' })
  const dialog = h('dialog', { class: 'details', 'aria-labelledby': 'details-title' })
  root.append(tooltip, live, dialog)

  const svgs = [...root.querySelectorAll<SVGSVGElement>('svg.dots')]
  const cursors = svgs.map((svg) => svg.appendChild(s('circle', { class: 'cursor', r: 4.8 })))
  let active: { svg: SVGSVGElement; i: number } | undefined

  const hide = (): void => {
    active = undefined
    for (const cursor of cursors) cursor.classList.remove('on')
    tooltip.classList.remove('on')
  }

  const show = (svg: SVGSVGElement, i: number): void => {
    const id = report.resources[i]
    const card = cardOf(svg)
    if (id === undefined || !card) return hide()
    active = { svg, i }
    const { x, y } = dotCenter(i, grid)
    for (const cursor of cursors) {
      cursor.setAttribute('cx', String(x))
      cursor.setAttribute('cy', String(y))
      cursor.classList.add('on')
    }

    const segments = id.split('>')
    const access = describeAccess(card, card.matches.get(id))
    tooltip.replaceChildren(
      h('strong', { class: 'tt-name' }, segments.at(-1) ?? id),
      ...(segments.length > 1 ? [h('span', { class: 'tt-path' }, segments.slice(0, -1).join(' › '))] : []),
      h('span', { class: 'tt-access' }, access),
    )
    live.textContent = `${id}: ${access}`

    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const dot = new DOMPoint(x, y).matrixTransform(ctm)
    tooltip.classList.add('on')
    const { offsetWidth: width, offsetHeight: height } = tooltip
    const below = dot.y - height - 14 < 8
    tooltip.classList.toggle('below', below)
    tooltip.style.left = `${Math.min(Math.max(8, dot.x - width / 2), window.innerWidth - width - 8)}px`
    tooltip.style.top = `${below ? dot.y + 14 : dot.y - 14}px`
  }

  const indexAt = (svg: SVGSVGElement, event: PointerEvent): number | undefined => {
    const ctm = svg.getScreenCTM()
    if (!ctm) return undefined
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse())
    const col = Math.floor(p.x / CELL)
    const row = Math.floor(p.y / CELL)
    if (col < 0 || col >= grid.cols || row < 0) return undefined
    const i = row * grid.cols + col
    return i < count ? i : undefined
  }

  const openDetails = (card: Card): void => {
    const rank = (match: CardMatch) => (match.state === 'explicit' ? 0 : 1)
    const items = [...card.matches].sort(([a, ma], [b, mb]) => rank(ma) - rank(mb) || compare(a, b))
    dialog.replaceChildren(
      h(
        'div',
        { class: 'details-body' },
        h(
          'header',
          { class: 'details-head' },
          h('h2', { id: 'details-title' }, card.category.title),
          h('button', { type: 'button', class: 'icon-button close', 'aria-label': 'Close' }, icon('x')),
        ),
        h('p', { class: 'details-summary' }, `${describeCounts(card)}, out of ${count}.`),
        items.length === 0
          ? h('p', { class: 'details-empty' }, 'No package gets this.')
          : h(
              'ol',
              { class: 'details-list' },
              ...items.map(([id, match]) =>
                h(
                  'li',
                  { class: match.state },
                  h('code', { class: 'resource' }, id),
                  h('span', { class: 'access' }, describeAccess(card, match)),
                ),
              ),
            ),
      ),
    )
    dialog.showModal()
  }

  const moves: Readonly<Record<string, (i: number) => number>> = {
    ArrowRight: (i) => i + 1,
    ArrowLeft: (i) => i - 1,
    ArrowDown: (i) => i + grid.cols,
    ArrowUp: (i) => i - grid.cols,
    Home: () => 0,
    End: () => count - 1,
  }

  for (const svg of svgs) {
    const card = cardOf(svg)
    svg.setAttribute('tabindex', '0')
    svg.setAttribute('role', 'group')
    svg.setAttribute(
      'aria-label',
      `${card ? `${card.category.title} ${describeCounts(card)}. ` : ''}Arrow keys move between packages, Enter shows the list.`,
    )
    svg.addEventListener(
      'pointermove',
      (event) => {
        const i = indexAt(svg, event)
        if (i === undefined) hide()
        else if (active?.svg !== svg || active.i !== i) show(svg, i)
      },
      { signal },
    )
    svg.addEventListener(
      'pointerdown',
      (event) => {
        const i = indexAt(svg, event)
        if (i !== undefined) show(svg, i)
      },
      { signal },
    )
    // A finger lifting also "leaves"; touch tooltips close on a tap elsewhere.
    svg.addEventListener('pointerleave', (event) => event.pointerType === 'mouse' && hide(), { signal })
    svg.addEventListener('focus', () => show(svg, active?.i ?? 0), { signal })
    svg.addEventListener('blur', hide, { signal })
    svg.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape') return hide()
        if (event.key === 'Enter' && card) return openDetails(card)
        const move = moves[event.key]
        if (!move) return
        event.preventDefault()
        show(svg, Math.min(count - 1, Math.max(0, move(active?.i ?? 0))))
      },
      { signal },
    )
  }

  root.addEventListener(
    'click',
    (event) => {
      const head = event.target instanceof Element ? event.target.closest('.card-head') : null
      const card = head ? cardOf(head) : undefined
      if (card) openDetails(card)
    },
    { signal },
  )
  dialog.addEventListener(
    'click',
    (event) => {
      const { target } = event
      if (target === dialog || (target instanceof Element && target.closest('.close'))) dialog.close()
    },
    { signal },
  )
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!(event.target instanceof Element && event.target.closest('svg.dots'))) hide()
    },
    { signal },
  )
  window.addEventListener('scroll', hide, { passive: true, signal })
  window.addEventListener('resize', hide, { signal })
}
