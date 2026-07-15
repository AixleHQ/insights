import { StrictMode, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { Provider as RollbarProvider } from "@rollbar/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "./lib/queryClient"
import { config } from "./lib/config"
import { rollbar, rollbarConfig } from "./lib/rollbar"
import "./index.css"
import App from "./App.tsx"

// Apply theme from localStorage before React renders to avoid flash
;(function () {
  const stored = localStorage.getItem("db90_theme")
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
  const isDark = stored === "dark" || (stored !== "light" && prefersDark)
  document.documentElement.classList.toggle("dark", isDark)
})()

/**
 * @rollbar/react treats `instance` as valid only when `options.accessToken` is
 * truthy (`isRollbarInstance`). Local Vite has no `__APP_CONFIG__.rollbarClientToken`,
 * so passing the shared disabled client as `instance` throws and blanks the app.
 * With no token, pass `config` instead and let the Provider construct its own client.
 */
function AppRollbarProvider({ children }: { children: ReactNode }) {
  if (config.rollbarClientToken) {
    return <RollbarProvider instance={rollbar}>{children}</RollbarProvider>
  }
  return <RollbarProvider config={rollbarConfig}>{children}</RollbarProvider>
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppRollbarProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </AppRollbarProvider>
  </StrictMode>,
)
