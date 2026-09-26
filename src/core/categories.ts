export type Row = 'hero' | 'reach' | 'send'

export interface Category {
  readonly id: string
  readonly row: Row
  readonly title: string
  readonly subtitle: string
  /**
   * Global paths the card looks for. The hero and overwrite cards are
   * computed from other rules and have none.
   */
  readonly targets: readonly string[]
}

// Fixed order that tells the attack: what a package can reach, then how it
// gets data or code out. The hero card is where the two meet.
export const categories = [
  {
    id: 'hero',
    row: 'hero',
    title: 'who can reach & send?',
    subtitle: 'Can reach something sensitive and fetch',
    targets: [],
  },
  {
    id: 'chrome',
    row: 'reach',
    title: 'who can call chrome.*?',
    subtitle: 'Extension APIs',
    targets: ['chrome', 'browser'],
  },
  {
    id: 'storage',
    row: 'reach',
    title: 'who can read storage?',
    subtitle: 'localStorage, IndexedDB, Cache Storage, cookies',
    targets: ['localStorage', 'sessionStorage', 'indexedDB', 'caches', 'cookieStore'],
  },
  {
    id: 'hardware',
    row: 'reach',
    title: 'who can talk to hardware?',
    subtitle: 'WebHID, WebUSB, Web Serial, Web Bluetooth',
    targets: ['navigator.hid', 'navigator.usb', 'navigator.serial', 'navigator.bluetooth'],
  },
  {
    id: 'clipboard',
    row: 'reach',
    title: 'who can touch the clipboard?',
    subtitle: 'Read or replace what was copied',
    targets: ['navigator.clipboard', 'ClipboardItem', 'clipboardData'],
  },
  {
    id: 'fetch',
    row: 'send',
    title: 'who can fetch?',
    subtitle: 'fetch, XHR, WebSocket, EventSource, WebRTC, beacons',
    targets: [
      'fetch',
      'XMLHttpRequest',
      'WebSocket',
      'MozWebSocket',
      'EventSource',
      'XDomainRequest',
      'WebTransport',
      'RTCPeerConnection',
      'navigator.sendBeacon',
    ],
  },
  {
    id: 'escape',
    row: 'send',
    title: 'who can escape the sandbox?',
    subtitle: 'A real DOM node, window or worker leads outside the compartment',
    targets: ['document', 'open', 'Worker', 'SharedWorker', 'importScripts', 'Image', 'Audio', 'top', 'parent'],
  },
  {
    id: 'overwrite',
    row: 'send',
    title: 'who can overwrite globals?',
    subtitle: 'Writes a global that another package reads',
    targets: [],
  },
] as const satisfies readonly Category[]
