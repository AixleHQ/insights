// IMPORTANT: React polyfill MUST be imported first before any other imports
// This ensures React.act is available for react-dom/test-utils
import "./react-polyfill"

import "@testing-library/jest-dom/vitest"

// Radix UI uses pointer capture and scroll APIs not available in jsdom
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};
Element.prototype.scrollIntoView = () => {};

// jsdom does not implement matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
