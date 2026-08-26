import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { registerSW } from "virtual:pwa-register"
import { queryClient } from "./lib/queryClient"
import { AppRollbarProvider } from "./components/AppRollbarProvider"
import "./index.css"
import App from "./App.tsx"

// A long-lived tab keeps executing the old JS bundle after a new deploy
// unless something reloads it. We reload automatically, same as
// registerType: "autoUpdate" would, but only once no mutation is in
// flight — reloading mid-mutation can strand a request whose response
// hasn't landed yet, and a user retry after reload can then duplicate a
// non-idempotent action.
const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    const reloadOnceIdle = () => {
      if (queryClient.isMutating() > 0) return
      unsubscribe()
      updateServiceWorker(true)
    }
    const unsubscribe = queryClient.getMutationCache().subscribe(reloadOnceIdle)
    reloadOnceIdle()
  },
})

// Apply theme from localStorage before React renders to avoid flash
;(function () {
  const stored = localStorage.getItem("db90_theme")
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
  const isDark = stored === "dark" || (stored !== "light" && prefersDark)
  document.documentElement.classList.toggle("dark", isDark)
})()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppRollbarProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </AppRollbarProvider>
  </StrictMode>,
)
