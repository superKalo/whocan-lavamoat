// The board as a standalone SVG or PNG, for slides. The dots come from the
// same drawDots as the screen and the colors from the page's current theme.
// The fonts are embedded, so the file looks the same in any viewer.
import type { Card, Report } from '../core/analyze.ts'
import { drawDots, gridFor, plural, type Grid } from './board.ts'
import { s } from './dom.ts'
import monaSansUrl from './fonts/mona-sans.woff2?url'
import monaSansMonoUrl from './fonts/mona-sans-mono.woff2?url'

const WIDTH = 1600
const PAD = 56
const GAP = 24
const CARD_PAD = 22
const HERO_PAD = 32
const MAX_CELL = 24
const SANS = "'Mona Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
const MONO = "'Mona Sans Mono', ui-monospace, Menlo, Consolas, monospace"

interface Palette {
  readonly bg: string
  readonly surface: string
  readonly border: string
  readonly text: string
  readonly muted: string
  readonly lit: string
  readonly dim: string
  readonly danger: string
  readonly success: string
  readonly glow: string
  readonly glowDanger: string
}

/** The page's current theme, resolved from the CSS tokens. */
const readPalette = (): Palette => {
  const probe = document.createElement('span')
  document.body.append(probe)
  const read = (token: string): string => {
    probe.style.color = `var(${token})`
    return getComputedStyle(probe).color
  }
  const palette = {
    bg: read('--bg'),
    surface: read('--surface'),
    border: read('--border'),
    text: read('--text'),
    muted: read('--muted'),
    lit: read('--lit'),
    dim: read('--dim'),
    danger: read('--danger'),
    success: read('--success'),
    glow: read('--glow'),
    glowDanger: read('--glow-danger'),
  }
  probe.remove()
  return palette
}

const channels = (color: string): number[] => color.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1]

/** Opaque mix of two computed colors: `t` of `b` into `a`. */
const mix = (a: string, b: string, t: number): string => {
  const [ar = 0, ag = 0, ab = 0] = channels(a)
  const [br = 0, bg = 0, bb = 0] = channels(b)
  const at = (x: number, y: number) => Math.round(x + (y - x) * t)
  return `rgb(${at(ar, br)} ${at(ag, bg)} ${at(ab, bb)})`
}

const withAlpha = (color: string, alpha: number): string => {
  const [r = 0, g = 0, b = 0] = channels(color)
  return `rgb(${r} ${g} ${b} / ${alpha})`
}

const isTransparent = (color: string): boolean => (channels(color)[3] ?? 1) === 0

const toDataUrl = async (url: string): Promise<string> => {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:font/woff2;base64,${btoa(binary)}`
}

let fontFaces: Promise<string> | undefined
const embeddedFonts = (): Promise<string> =>
  (fontFaces ??= Promise.all([toDataUrl(monaSansUrl), toDataUrl(monaSansMonoUrl)]).then(
    ([sans, mono]) =>
      `@font-face{font-family:'Mona Sans';src:url(${sans}) format('woff2');font-weight:200 900}` +
      `@font-face{font-family:'Mona Sans Mono';src:url(${mono}) format('woff2');font-weight:200 900}`,
    (error: unknown) => {
      fontFaces = undefined
      throw error
    },
  ))

interface TextStyle {
  readonly size: number
  readonly weight?: number
  readonly fill: string
  readonly mono?: boolean
  readonly anchor?: 'start' | 'end'
  readonly tracking?: number
}

const cssFont = (style: TextStyle): string => `${style.weight ?? 400} ${style.size}px ${style.mono ? MONO : SANS}`

const measurer = document.createElement('canvas').getContext('2d')
const textWidth = (content: string, style: TextStyle): number => {
  if (!measurer) return content.length * style.size * 0.55
  measurer.font = cssFont(style)
  return measurer.measureText(content).width + (style.tracking ?? 0) * content.length
}

/** Breaks text into lines no wider than `max`. */
const wrap = (content: string, style: TextStyle, max: number): string[] => {
  const lines: string[] = []
  let line = ''
  for (const word of content.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (line && textWidth(next, style) > max) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  return line ? [...lines, line] : lines
}

const text = (x: number, y: number, content: string, style: TextStyle): SVGTextElement =>
  s(
    'text',
    {
      x,
      y,
      fill: style.fill,
      'font-family': style.mono ? MONO : SANS,
      'font-size': style.size,
      'font-weight': style.weight ?? 400,
      'text-anchor': style.anchor ?? 'start',
      'letter-spacing': style.tracking,
    },
    content,
  )

const pill = (x: number, y: number, label: string, color: string, size = 14): SVGGElement => {
  const style = { size, weight: 500, fill: color }
  const height = size + 10
  return s(
    'g',
    {},
    s('rect', {
      x: x + 0.5,
      y: y + 0.5,
      width: textWidth(label, style) + 20,
      height,
      rx: height / 2,
      fill: 'none',
      stroke: withAlpha(color, 0.45),
    }),
    text(x + 10, y + height / 2 + size * 0.36, label, style),
  )
}

/** drawDots, placed at x, y and scaled to `width`. */
const placeDots = (card: Card, resources: readonly string[], grid: Grid, x: number, y: number, width: number) => {
  const svg = drawDots(card, resources, grid)
  svg.removeAttribute('style')
  for (const [name, value] of Object.entries({ x, y, width, height: (width * grid.rows) / grid.cols })) {
    svg.setAttribute(name, String(value))
  }
  return svg
}

const scoreColor = (card: Card, palette: Palette, hero = false): string =>
  card.explicit + card.inherited === 0 ? palette.success : hero ? palette.danger : palette.lit

/** A card of the reach or send row. */
const cardLayout = (card: Card, total: number, width: number, palette: Palette) => {
  const inner = width - 2 * CARD_PAD
  const title = { size: 20, weight: 600, fill: palette.text }
  const subtitle = { size: 15, fill: palette.muted }
  const count = { size: 40, weight: 700, fill: scoreColor(card, palette), tracking: -0.8 }
  const totalStyle = { size: 16, weight: 500, fill: palette.muted }
  const totalText = `/ ${total}`
  const totalWidth = textWidth(totalText, totalStyle)
  const scoreWidth = textWidth(String(card.explicit), count) + 6 + totalWidth
  const titleLines = wrap(card.category.title, title, inner - scoreWidth - 16)
  const subtitleLines = wrap(card.category.subtitle, subtitle, inner)
  const titleBlock = Math.max(titleLines.length * 26, 44)
  const headHeight = titleBlock + 6 + subtitleLines.length * 21 + (card.inherited > 0 ? 36 : 0)

  const draw = (x: number, y: number, height: number, dots: SVGSVGElement): SVGGElement =>
    s(
      'g',
      {},
      s('rect', { x: x + 0.5, y: y + 0.5, width: width - 1, height: height - 1, rx: 14, fill: palette.surface, stroke: palette.border }),
      ...titleLines.map((line, i) => text(x + CARD_PAD, y + CARD_PAD + 22 + i * 26, line, title)),
      text(x + width - CARD_PAD, y + CARD_PAD + 38, totalText, { ...totalStyle, anchor: 'end' }),
      text(x + width - CARD_PAD - totalWidth - 6, y + CARD_PAD + 38, String(card.explicit), { ...count, anchor: 'end' }),
      ...subtitleLines.map((line, i) => text(x + CARD_PAD, y + CARD_PAD + titleBlock + 6 + 15 + i * 21, line, subtitle)),
      ...(card.inherited > 0
        ? [pill(x + CARD_PAD, y + CARD_PAD + titleBlock + 6 + subtitleLines.length * 21 + 12, `+${card.inherited} via broad grants`, palette.lit)]
        : []),
      dots,
    )
  return { headHeight, draw }
}

/** A row of cards with the dots lined up at the bottom. Returns the row height. */
const drawRow = (
  root: SVGSVGElement,
  cards: readonly Card[],
  report: Report,
  grid: Grid,
  palette: Palette,
  y: number,
): number => {
  const width = (WIDTH - 2 * PAD - (cards.length - 1) * GAP) / cards.length
  const dotsWidth = Math.min(width - 2 * CARD_PAD, grid.cols * MAX_CELL)
  const dotsHeight = (dotsWidth * grid.rows) / grid.cols
  const layouts = cards.map((card) => cardLayout(card, report.resources.length, width, palette))
  const height = Math.max(...layouts.map((l) => l.headHeight)) + 2 * CARD_PAD + 20 + dotsHeight
  cards.forEach((card, i) => {
    const x = PAD + i * (width + GAP)
    const dots = placeDots(card, report.resources, grid, x + CARD_PAD, y + height - CARD_PAD - dotsHeight, dotsWidth)
    root.append(layouts[i]?.draw(x, y, height, dots) ?? s('g'))
  })
  return height
}

/** The hero card: text on the left, dots on the right. Returns its height. */
const drawHero = (root: SVGSVGElement, card: Card, report: Report, grid: Grid, palette: Palette, y: number): number => {
  const width = WIDTH - 2 * PAD
  const column = (width - 2 * HERO_PAD - 32) / 2
  const dotsWidth = Math.min(column, 560, grid.cols * MAX_CELL)
  const dotsHeight = (dotsWidth * grid.rows) / grid.cols
  const title = { size: 34, weight: 700, fill: palette.text, tracking: -0.4 }
  const subtitle = { size: 18, fill: palette.muted }
  const count = { size: 104, weight: 700, fill: scoreColor(card, palette, true), tracking: -2 }
  const totalStyle = { size: 26, weight: 500, fill: palette.muted }
  const titleLines = wrap(card.category.title, title, column)
  const subtitleLines = wrap(card.category.subtitle, subtitle, column)
  const textHeight = titleLines.length * 42 + subtitleLines.length * 26 + 24 + 88 + (card.inherited > 0 ? 44 : 0)
  const height = Math.max(textHeight, dotsHeight) + 2 * HERO_PAD
  const x = PAD
  let ty = y + HERO_PAD + (height - 2 * HERO_PAD - textHeight) / 2
  const g = s(
    'g',
    { class: 'hero' },
    s('rect', {
      x: x + 0.5,
      y: y + 0.5,
      width: width - 1,
      height: height - 1,
      rx: 16,
      fill: 'url(#hero-bg)',
      stroke: mix(palette.border, palette.danger, 0.5),
    }),
  )
  for (const line of titleLines) {
    g.append(text(x + HERO_PAD, ty + 34, line, title))
    ty += 42
  }
  for (const line of subtitleLines) {
    g.append(text(x + HERO_PAD, ty + 22, line, subtitle))
    ty += 26
  }
  ty += 24
  const countWidth = textWidth(String(card.explicit), count)
  g.append(text(x + HERO_PAD, ty + 80, String(card.explicit), count))
  g.append(text(x + HERO_PAD + countWidth + 10, ty + 80, `/ ${report.resources.length}`, totalStyle))
  ty += 88
  if (card.inherited > 0) g.append(pill(x + HERO_PAD, ty + 14, `+${card.inherited} via broad grants`, palette.danger, 16))
  g.append(placeDots(card, report.resources, grid, x + width - HERO_PAD - dotsWidth, y + (height - dotsHeight) / 2, dotsWidth))
  root.append(g)
  return height
}

/** The whole board as a standalone SVG. `label` says which policy it is. */
export const renderBoardSvg = async (report: Report, label: string): Promise<SVGSVGElement> => {
  const [fonts] = await Promise.all([
    embeddedFonts(),
    document.fonts.load(`600 20px 'Mona Sans'`),
    document.fonts.load(`400 18px 'Mona Sans Mono'`),
  ])
  const palette = readPalette()
  const grid = gridFor(report.resources.length)
  const dots = [
    `.dim circle{fill:${palette.dim}}`,
    `.ring circle{fill:none;stroke:${palette.lit};stroke-width:1.3}`,
    `.fill circle{fill:${palette.lit}}`,
    `.hero .ring circle{stroke:${palette.danger}}`,
    `.hero .fill circle{fill:${palette.danger}}`,
    ...(isTransparent(palette.glow) ? [] : ['.fill{filter:url(#glow)}', '.hero .fill{filter:url(#glow-danger)}']),
  ]
  const glow = (id: string, color: string) =>
    s('filter', { id, x: '-50%', y: '-50%', width: '200%', height: '200%' }, s('feDropShadow', { dx: 0, dy: 0, stdDeviation: 0.75, 'flood-color': color }))

  const root = s(
    'svg',
    { width: WIDTH },
    s('style', {}, fonts + dots.join('')),
    s(
      'defs',
      {},
      glow('glow', palette.glow),
      glow('glow-danger', palette.glowDanger),
      s(
        'linearGradient',
        { id: 'hero-bg', x1: 0, y1: 0, x2: 1, y2: 1 },
        s('stop', { offset: 0, 'stop-color': mix(palette.surface, palette.danger, 0.07) }),
        s('stop', { offset: 0.55, 'stop-color': palette.surface }),
      ),
    ),
  )
  const background = s('rect', { width: WIDTH, fill: palette.bg })
  root.append(background)

  let y = PAD
  root.append(text(PAD, y + 58, plural(report.resources.length, 'package'), { size: 64, weight: 700, fill: palette.text, tracking: -1.3 }))
  y += 58 + 16
  root.append(text(PAD, y + 22, 'What each one is allowed to touch, capability by capability.', { size: 22, fill: palette.muted }))
  y += 22 + 18
  root.append(text(PAD, y + 18, label, { size: 18, fill: palette.muted, mono: true }))
  y += 18 + 40

  const byRow = (row: string) => report.cards.filter((card) => card.category.row === row)
  const [hero] = byRow('hero')
  if (hero) y += drawHero(root, hero, report, grid, palette, y) + 40
  for (const [row, title] of [
    ['reach', 'What a package can reach'],
    ['send', 'How it gets out'],
  ] as const) {
    root.append(text(PAD, y + 22, title, { size: 22, weight: 600, fill: palette.text }))
    y += 22 + 18
    y += drawRow(root, byRow(row), report, grid, palette, y) + 40
  }

  const site = `${location.host}${import.meta.env.BASE_URL}`.replace(/\/$/, '')
  root.append(text(WIDTH - PAD, y + 12, `whocan · ${site}`, { size: 16, fill: palette.muted, anchor: 'end' }))
  const height = Math.ceil(y + 12 + PAD)
  root.setAttribute('height', String(height))
  root.setAttribute('viewBox', `0 0 ${WIDTH} ${height}`)
  background.setAttribute('height', String(height))
  return root
}

const fileName = (label: string): string =>
  `whocan-${
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'board'
  }`

const save = (blob: Blob, name: string): void => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const serialize = (svg: SVGSVGElement): Blob =>
  new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })

export const downloadSvg = async (report: Report, label: string): Promise<void> => {
  save(serialize(await renderBoardSvg(report, label)), `${fileName(label)}.svg`)
}

/** The SVG drawn onto a canvas at 2x. */
export const downloadPng = async (report: Report, label: string): Promise<void> => {
  const svg = await renderBoardSvg(report, label)
  const scale = 2
  const url = URL.createObjectURL(serialize(svg))
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Number(svg.getAttribute('width')) * scale
    canvas.height = Number(svg.getAttribute('height')) * scale
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser cannot draw the PNG.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!png) throw new Error('This browser cannot draw the PNG.')
    save(png, `${fileName(label)}.png`)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Wires the export buttons of a rendered report. */
export const attachExport = (root: HTMLElement, report: Report, label: string, fail: (error: unknown) => void): void => {
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-export]')) {
    button.addEventListener('click', () => {
      button.disabled = true
      const task = button.dataset.export === 'png' ? downloadPng(report, label) : downloadSvg(report, label)
      task.catch(fail).finally(() => {
        button.disabled = false
      })
    })
  }
}
