import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { NavLinks } from "@/components/nav-links";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { LogOut } from "lucide-react";
import { JRHoldingMark } from "@/components/jr-holding-logo";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";
import { getActiveScope, getGroupsWithCompanies, getAllCompanies, getScopeLabel } from "@/lib/scope";
import { ThemeToggle } from "@/components/theme-toggle";
import { CompanySwitcher } from "@/components/company-switcher";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const scope = await getActiveScope();
  const [groups, allCompanies, scopeLabel] = await Promise.all([
    getGroupsWithCompanies(),
    getAllCompanies(),
    getScopeLabel(scope),
  ]);

  const ungroupedCompanies = allCompanies.filter((c) => !c.groupId);
  const currentValue =
    scope.type === "all" ? "all" : scope.type === "group" ? `group:${scope.groupId}` : `company:${scope.companyId}`;

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <JRHoldingMark showWordmark={false} className="size-6 shrink-0" />
            <span className="font-semibold truncate">FluxoJR</span>
          </div>
          <CompanySwitcher groups={groups} ungroupedCompanies={ungroupedCompanies} currentValue={currentValue} />
        </SidebarHeader>
        <SidebarContent>
          <NavLinks />
        </SidebarContent>
        {isSupabaseConfigured && (
          <SidebarFooter>
            <form action={logout}>
              <Button variant="ghost" size="sm" className="w-full justify-start" type="submit">
                <LogOut />
                Sair
              </Button>
            </form>
          </SidebarFooter>
        )}
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm text-muted-foreground flex-1">{scopeLabel}</span>
          <ThemeToggle />
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
