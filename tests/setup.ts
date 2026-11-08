import './support/chart'
import { afterEach, vi } from 'vitest'
import { config, enableAutoUnmount } from '@vue/test-utils'
import { vuetify } from '@/vuetify'

// jsdom has no layout engine; browser-level gestures and rendering are covered by Playwright.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => true,
  }),
})
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)
window.visualViewport ??= {
  width: 1024,
  height: 768,
  scale: 1,
  offsetTop: 0,
  offsetLeft: 0,
  addEventListener() {},
  removeEventListener() {},
} as unknown as VisualViewport
HTMLElement.prototype.scrollTo = function (options?: ScrollToOptions | number) {
  if (typeof options === 'object') this.scrollTop = options.top ?? this.scrollTop
}
config.global.plugins.push(vuetify)
enableAutoUnmount(afterEach)
