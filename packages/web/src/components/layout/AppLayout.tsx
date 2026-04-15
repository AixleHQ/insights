import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Header } from "./Header";
import { useImpersonation } from "../../contexts/ImpersonationContext";

export function AppLayout() {
  const { isImpersonating } = useImpersonation();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className={`flex flex-col h-svh overflow-hidden ${isImpersonating ? "pt-10" : ""}`}>
        <Header />
        <main className="flex-1 overflow-auto pb-[env(safe-area-inset-bottom)]">
          <div className="container mx-auto px-4 py-6 md:px-6">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
