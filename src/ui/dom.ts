// Tiny element builders. Text goes in as text nodes and attributes through
// setAttribute, so nothing from a policy is ever parsed as HTML.

type Attrs = Readonly<Record<string, string | number | boolean | null | undefined>>
type Child = Node | string | null | undefined | false

const SVG_NS = 'http://www.w3.org/2000/svg'

const build = <E extends Element>(el: E, attrs: Attrs, children: readonly Child[]): E => {
  for (const [name, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue
    el.setAttribute(name, value === true ? '' : String(value))
  }
  for (const child of children) {
    if (child !== null && child !== undefined && child !== false) el.append(child)
  }
  return el
}

export const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] => build(document.createElement(tag), attrs, children)

export const s = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): SVGElementTagNameMap[K] => build(document.createElementNS(SVG_NS, tag), attrs, children)
