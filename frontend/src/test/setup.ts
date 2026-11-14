import "@testing-library/jest-dom/vitest";

// Node 26 no longer exposes its global localStorage by default, and Vitest's
// jsdom environment can consequently leave window.localStorage undefined.
// Provide the browser Storage contract used by the app in a deterministic,
// per-test-environment store.
const values = new Map<string, string>();
const localStorageMock: Storage = {
  get length() {
    return values.size;
  },
  clear: () => values.clear(),
  getItem: (key) => values.get(String(key)) ?? null,
  key: (index) => [...values.keys()][index] ?? null,
  removeItem: (key) => values.delete(String(key)),
  setItem: (key, value) => values.set(String(key), String(value)),
};

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: localStorageMock,
});
