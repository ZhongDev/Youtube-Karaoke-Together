import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key) { return this.values.has(String(key)) ? this.values.get(String(key)) : null; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  removeItem(key) { this.values.delete(String(key)); }
  setItem(key, value) { this.values.set(String(key), String(value)); }
}

Object.defineProperty(window, "localStorage", { configurable: true, value: new MemoryStorage() });
Object.defineProperty(window, "sessionStorage", { configurable: true, value: new MemoryStorage() });

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});
