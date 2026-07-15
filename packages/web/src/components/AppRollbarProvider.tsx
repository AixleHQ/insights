import { type ReactNode } from "react"
import { Provider as RollbarProvider } from "@rollbar/react"
import { config } from "@/lib/config"
import { rollbar, rollbarConfig } from "@/lib/rollbar"

/**
 * @rollbar/react treats `instance` as valid only when `options.accessToken` is
 * truthy (`isRollbarInstance`). Local Vite has no `__APP_CONFIG__.rollbarClientToken`,
 * so passing the shared disabled client as `instance` throws and blanks the app.
 * With no token, pass `config` instead and let the Provider construct its own client.
 */
export function AppRollbarProvider({ children }: { children: ReactNode }) {
  if (config.rollbarClientToken) {
    return <RollbarProvider instance={rollbar}>{children}</RollbarProvider>
  }
  return <RollbarProvider config={rollbarConfig}>{children}</RollbarProvider>
}
