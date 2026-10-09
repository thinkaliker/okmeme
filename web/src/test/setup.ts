/**
 * Node exposes a `localStorage` global that throws unless the process was
 * started with `--localstorage-file`, and jsdom does not always shadow it. The
 * app treats storage as best-effort and swallows the failure, which is right in
 * a browser and useless in a test — so give the tests a real one.
 */
function installMemoryStorage(): void {
  const store = new Map<string, string>();
  const memory: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => void store.delete(key),
    setItem: (key, value) => void store.set(key, String(value)),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: memory, configurable: true });
}

try {
  globalThis.localStorage.setItem('okmeme.probe', '1');
  globalThis.localStorage.removeItem('okmeme.probe');
} catch {
  installMemoryStorage();
}

/**
 * jsdom has no `matchMedia`. The theme layer reads it to resolve
 * `prefers-color-scheme`, so the shim belongs here rather than as a defensive
 * branch in code that only ever runs in a real browser.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
