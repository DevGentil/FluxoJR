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
import { getActiveScope, getGroupsWithCompanies, getAllCompanies, getScopeLabel, resolveCompanyIds } from "@/lib/scope";
import { ThemeToggle } from "@/components/theme-toggle";
import { CompanySwitcher } from "@/components/company-switcher";
import { redirect } from "next/navigation";
import { companyIdsVisiveis, contaAtual, modulosVisiveis } from "@/lib/access";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Senha definida por outra pessoa nao entra no sistema. Enquanto nao for
  // trocada, o log de auditoria responderia "a conta da Fulana alterou" e
  // nao "a Fulana alterou" — que e a diferenca que importa numa divergencia.
  //
  // A checagem fica aqui, e nao no middleware, porque o middleware roda no
  // edge e nao alcanca o Prisma. Todo caminho de dentro do sistema passa por
  // este layout.
  const conta = await contaAtual();
  if (conta?.senhaProvisoria) redirect("/trocar-senha");

  const scope = await getActiveScope();
  const [groups, allCompanies, scopeLabel, visiveis, modulos] = await Promise.all([
    getGroupsWithCompanies(),
    getAllCompanies(),
    getScopeLabel(scope),
    companyIdsVisiveis(),
    resolveCompanyIds(scope).then(modulosVisiveis),
  ]);

  // O seletor de escopo tambem se limita ao que a conta enxerga: listar uma
  // unidade que a pessoa nao pode abrir so produz uma tela vazia e a
  // impressao de que o sistema quebrou.
  const permitidas = new Set(visiveis);
  const gruposVisiveis = groups
    .map((g) => ({ ...g, companies: g.companies.filter((c) => permitidas.has(c.id)) }))
    .filter((g) => g.companies.length > 0);
  const ungroupedCompanies = allCompanies.filter((c) => !c.groupId && permitidas.has(c.id));
  const currentValue =
    scope.type === "all" ? "all" : scope.type === "group" ? `group:${scope.groupId}` : `company:${scope.companyId}`;

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <JRHoldingMark showWordmark={false} className="size-6 shrink-0" sizes="24px" />
            <span className="font-semibold truncate">FluxoJR</span>
          </div>
          <CompanySwitcher
            groups={gruposVisiveis}
            ungroupedCompanies={ungroupedCompanies}
            currentValue={currentValue}
          />
        </SidebarHeader>
        <SidebarContent>
          <NavLinks modulos={modulos} />
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
