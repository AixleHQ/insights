import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider as RollbarProvider } from '@rollbar/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { rollbarConfig } from './lib/rollbar'
import './index.css'
import App from './App.tsx'

document.documentElement.classList.add('dark')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RollbarProvider config={rollbarConfig}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </RollbarProvider>
  </StrictMode>,
)
