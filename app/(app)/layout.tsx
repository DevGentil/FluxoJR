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
import { LogOut, Wallet } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";
import { getDefaultCompany } from "@/lib/company";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const company = await getDefaultCompany();

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Wallet className="size-5 shrink-0" />
            <div className="flex flex-col leading-tight overflow-hidden">
              <span className="font-semibold truncate">FluxoJR</span>
              <span className="text-xs text-muted-foreground truncate">{company.name}</span>
            </div>
          </div>
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
          <span className="text-sm text-muted-foreground flex-1">{company.name}</span>
          <ThemeToggle />
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
