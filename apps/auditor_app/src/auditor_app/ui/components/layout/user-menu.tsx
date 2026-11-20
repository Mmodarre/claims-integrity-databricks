import { LogOut } from "lucide-react";
import { toast } from "sonner";

import { useCurrentUser } from "@/lib/api";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export function UserMenu() {
  // Non-suspense + resilient: if identity can't be resolved (e.g. no OBO token), fall
  // back to a generic label rather than breaking the header.
  const { data: user } = useCurrentUser({
    query: { select: (d) => d.data, retry: false, staleTime: Infinity },
  });

  const display = user?.display_name ?? "Auditor";
  const email = user?.email ?? user?.user_name ?? "";
  const initials = user?.initials ?? "AU";

  const signOut = () => {
    toast.success("Signing out…", { description: "Ending your Databricks Apps session." });
    // Databricks Apps clears the OBO session at /logout.
    window.location.href = "/logout";
  };

  return (
    <div className="flex items-center gap-3">
      <div className="hidden items-center gap-2 sm:flex">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <div className="leading-tight">
          <p className="text-sm font-medium" title={display}>
            {display}
          </p>
          {email && <p className="max-w-[180px] truncate text-xs text-muted-foreground">{email}</p>}
          {user && !user.can_view_pii && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400" title="Member PII is masked for your groups">
              PII masked
            </p>
          )}
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={signOut} aria-label="Sign out">
        <LogOut className="h-4 w-4 sm:mr-2" />
        <span className="hidden sm:inline">Sign out</span>
      </Button>
    </div>
  );
}
