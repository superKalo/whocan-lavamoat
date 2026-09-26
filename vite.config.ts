import { defineConfig, type Plugin } from 'vite'

// Policies are untrusted input, so the production build ships a strict CSP.
// Dev is left alone because Vite injects CSS there as inline <style> tags.
const csp = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  'connect-src https://api.github.com https://raw.githubusercontent.com https://cdn.jsdelivr.net',
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const contentSecurityPolicy = (): Plugin => ({
  name: 'whocan:csp',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: csp },
      injectTo: 'head-prepend',
    },
  ],
})

export default defineConfig({
  // GitHub Pages serves the project from /whocan/.
  base: '/whocan/',
  plugins: [contentSecurityPolicy()],
})
