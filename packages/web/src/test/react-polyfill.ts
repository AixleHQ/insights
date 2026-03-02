/**
 * React 19 Polyfill for react-dom/test-utils compatibility
 *
 * React 19 changed how `act` is exported - it's now a named export from 'react'
 * instead of being attached to the React default export. This causes issues with
 * react-dom/test-utils which expects to find React.act.
 *
 * This polyfill ensures React.act is available for react-dom/test-utils.
 */

// Must import act before React to ensure it's available
import { act } from 'react'
import * as ReactNamespace from 'react'

// Declare global types
declare global {
  // eslint-disable-next-line no-var
  var React: typeof ReactNamespace & { act: typeof act }
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

// Create a version of React with act attached
// Use Object.assign to ensure all properties are copied
const ReactWithAct = Object.assign(
  {},
  ReactNamespace,
  { act }
) as typeof ReactNamespace & { act: typeof act }

// Set it globally for react-dom/test-utils
globalThis.React = ReactWithAct
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Also try to patch the React module directly if possible
try {
  Object.defineProperty(ReactNamespace, 'act', {
    value: act,
    writable: false,
    configurable: true,
  })
} catch (e) {
  // Ignore if we can't modify the module
}

// Export to ensure this module is loaded
export {}
