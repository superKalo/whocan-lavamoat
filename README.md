# whocan for LavaMoat

See what a LavaMoat browser policy lets each package do.

## LavaMoat in brief

By default, every npm package in a JavaScript application runs with the application's full authority. A dependency deep in the tree can read `localStorage`, call `chrome.*`, access browser APIs, and send data elsewhere with `fetch`. That means a single compromised package can become a supply-chain attack.

[LavaMoat](https://github.com/LavaMoat/LavaMoat) reduces that risk by running packages in isolated SES compartments. Each package sees only the globals and other packages explicitly granted by a generated policy; everything else is unavailable. The policy therefore describes the application's real package-level attack surface—but large policies are difficult to review as raw JSON.

`whocan` turns a large `policy.json` into a capability-first board. Each dot is a package resource, highlighted where the policy grants access.

## What it shows

- Who can call `chrome.*`
- Who can read storage
- Who can access hardware or the clipboard
- Who can fetch or use other network APIs
- Who can escape the sandbox
- Who can overwrite globals used by other packages
- Who can both reach sensitive data and send it out

Direct grants and access inherited from broader grants are shown separately. Hover or select a package to highlight it across the board, inspect the matching grants, and export the result as SVG or PNG.

## Load a policy

- Enter `owner/repo[@ref]` or paste a GitHub URL.
- Drop or choose `policy.json` and, optionally, `policy-override.json`.
- Paste a policy directly into the page.

Local files are processed entirely in the browser and are never uploaded. There are no analytics and no runtime dependencies.

## How counting works

`whocan` follows LavaMoat's policy semantics for overrides, global aliases, broad grants, and `"write"` access. It supports browser policies produced by `@lavamoat/webpack` and `lavamoat-browserify`.

The board is a lower bound: DOM access can lead to the real `window`, excluded modules and unprotected entry points do not appear in the policy, and transitive access through imported packages is not counted.

## Development

Requires Node.js 22.18 or newer.

```sh
npm install
npm run dev
```

```sh
npm test
npm run build
```

## License

[MIT](LICENSE)
