import { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { Toaster } from "sonner";

import { ModeToggle } from "@/components/apx/mode-toggle";
import { ThemeProvider } from "@/components/apx/theme-provider";
import { GeniePanel } from "@/components/genie/genie-panel";
import { UserMenu } from "@/components/layout/user-menu";
import { Separator } from "@/components/ui/separator";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="auditor-ui-theme">
      <div className="min-h-screen bg-background text-foreground">
        <header className="sticky top-0 z-20 border-b bg-card/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-6">
            <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Claims Integrity Auditor
            </Link>
            <div className="flex items-center gap-3">
              <GeniePanel />
              <ModeToggle />
              <Separator orientation="vertical" className="hidden h-8 sm:block" />
              <UserMenu />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-6 py-6">
          <Outlet />
        </main>
      </div>
      <Toaster richColors />
    </ThemeProvider>
  );
}
