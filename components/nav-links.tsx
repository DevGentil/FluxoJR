"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  CalendarClock,
  Tags,
  Landmark,
  FileBarChart,
  Building2,
  Truck,
  ScrollText,
  Wallet,
  Stethoscope,
  Users,
  ClipboardList,
} from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

/** O menu agrupado por PERGUNTA, não por ordem de criação.
 *
 * Eram treze itens numa lista corrida, onde "Categorias" ficava entre
 * "Fechamento de Caixa" e "Fornecedores" — cadastro no meio da rotina
 * diária. Agora cada bloco responde a uma coisa: o que entrou e saiu, o que
 * pagamos aos médicos, como fechou, e o que está cadastrado.
 *
 * Cadastros vão para o fim de propósito: são as telas que se abre uma vez e
 * quase não se volta, e estavam ocupando o meio do caminho. */
const grupos = [
  {
    label: null,
    links: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Movimento",
    links: [
      { href: "/transacoes", label: "Transações", icon: ArrowLeftRight },
      { href: "/contas-a-pagar-receber", label: "A Pagar/Receber", icon: CalendarClock },
      { href: "/fechamento-caixa", label: "Fechamento de Caixa", icon: Wallet },
    ],
  },
  {
    label: "Repasses médicos",
    links: [
      { href: "/repasses-medicos", label: "Lançamentos", icon: Stethoscope },
      { href: "/medicos", label: "Médicos", icon: Users },
      { href: "/operacao", label: "Operação", icon: ClipboardList },
    ],
  },
  {
    label: "Análise",
    links: [
      { href: "/relatorios", label: "Relatórios", icon: FileBarChart },
      { href: "/balanco", label: "Balanço", icon: ScrollText },
    ],
  },
  {
    label: "Cadastros",
    links: [
      { href: "/categorias", label: "Categorias", icon: Tags },
      { href: "/fornecedores", label: "Fornecedores", icon: Truck },
      { href: "/contas-bancarias", label: "Contas Bancárias", icon: Landmark },
      { href: "/empresas", label: "Empresas", icon: Building2 },
    ],
  },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {grupos.map((grupo, i) => (
        <SidebarGroup key={grupo.label ?? i} className={grupo.label ? undefined : "pb-0"}>
          {grupo.label && <SidebarGroupLabel>{grupo.label}</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {grupo.links.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    // Marca o item também quando se está numa tela filha —
                    // a ficha de um médico é /medicos/<id>.
                    isActive={pathname === href || pathname.startsWith(`${href}/`)}
                    render={<Link href={href} />}
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
