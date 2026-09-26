/*
 * Port of `mergePolicy` from lavamoat-core (src/mergePolicy.js) and the path
 * helpers it uses from lavamoat-tofu (src/util.js), limited to `globals`.
 * test/mergePolicy.test.ts checks it against lavamoat-core itself.
 *
 * One deliberate difference: where LavaMoat throws on a hierarchy violation,
 * this returns the violation, so the board can still be drawn.
 *
 * LavaMoat (https://github.com/LavaMoat/LavaMoat)
 * Copyright (c) 2020 Consensys Software
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import type { Policy, ResourcePolicy } from './policy.ts'

/** A granted path under a granted parent. LavaMoat fails the build on these. */
export interface HierarchyViolation {
  readonly resource: string
  readonly path: string
  readonly parent: string
}

/** An override `false` that LavaMoat drops because a parent is granted. */
export interface IgnoredDenial {
  readonly resource: string
  readonly path: string
  readonly parent: string
}

export interface MergedPolicy {
  readonly policy: Policy
  readonly violations: readonly HierarchyViolation[]
  readonly ignoredDenials: readonly IgnoredDenial[]
}

/** 'a.b.c' → ['a', 'a.b'] */
const parentPaths = (path: string): string[] => {
  const parts = path.split('.')
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('.'))
}

/** Drops every path that has a parent in the map, even a `false` parent. */
const reduceToTopmostApiCalls = (items: Map<string, unknown>): void => {
  const paths = new Set(items.keys())
  for (const path of paths) {
    if (parentPaths(path).some((parent) => paths.has(parent))) items.delete(path)
  }
}

/** Finds granted (non-`false`) paths under a granted parent. */
const validateHierarchy = (items: ReadonlyMap<string, unknown>): { path: string; parent: string }[] => {
  const granted = new Set([...items].filter(([, value]) => value !== false).map(([path]) => path))
  return [...granted].sort().flatMap((path) => {
    const parent = parentPaths(path).find((p) => granted.has(p))
    return parent === undefined ? [] : [{ path, parent }]
  })
}

/**
 * Merges an override into a policy the way LavaMoat does before a build.
 * Without an override the policy comes back untouched, as in LavaMoat.
 */
export const mergePolicy = (policy: Policy, override?: Policy): MergedPolicy => {
  if (!override) return { policy, violations: [], ignoredDenials: [] }

  const violations: HierarchyViolation[] = []
  const ignoredDenials: IgnoredDenial[] = []
  const resources = new Map<string, ResourcePolicy>()

  for (const name of new Set([...policy.resources.keys(), ...override.resources.keys()])) {
    const base = policy.resources.get(name)
    const over = override.resources.get(name)
    const node = Boolean(base?.node || over?.node)
    if (!base?.globals && !over?.globals) {
      resources.set(name, { node })
      continue
    }

    const items = new Map<string, unknown>([...(base?.globals ?? []), ...(over?.globals ?? [])])
    reduceToTopmostApiCalls(items)
    // Re-grant the sub-paths the override allows, so `false` on a parent plus
    // `true` on a child narrows a grant.
    for (const [path, value] of over?.globals ?? []) {
      if (value !== false && !items.has(path)) items.set(path, value)
    }

    for (const { path, parent } of validateHierarchy(items)) {
      violations.push({ resource: name, path, parent })
    }
    for (const [path, value] of over?.globals ?? []) {
      if (value !== false || items.has(path)) continue
      const parent = parentPaths(path).find((p) => items.has(p) && items.get(p) !== false)
      if (parent !== undefined) ignoredDenials.push({ resource: name, path, parent })
    }
    resources.set(name, { globals: items, node })
  }

  return { policy: { resources }, violations, ignoredDenials }
}
