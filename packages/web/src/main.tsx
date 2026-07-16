import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "./lib/queryClient"
import { AppRollbarProvider } from "./components/AppRollbarProvider"
import "./index.css"
import App from "./App.tsx"

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
