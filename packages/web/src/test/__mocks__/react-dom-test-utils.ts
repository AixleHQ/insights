/**
 * Mock for react-dom/test-utils to fix React 19 compatibility
 *
 * This module intercepts imports of react-dom/test-utils and provides
 * a working implementation that uses React 19's act correctly.
 */

import { act } from 'react'

// Re-export everything from the actual react-dom/test-utils
export * from 'react-dom/test-utils'

// Override act with React 19's version
export { act }
