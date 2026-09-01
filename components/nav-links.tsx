"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bug,
  History,
  KeyRound,
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
import type { Module } from "@/lib/permissions";
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
 * quase não se volta, e estavam ocupando o meio do caminho.
 *
 * Administração é bloco próprio, e não mais um pedaço de Cadastros. Conta de
 * acesso, auditoria e erro do sistema não são entidades do negócio — são
 * sobre QUEM usa o sistema e COMO ele está se comportando. Empilhadas ali,
 * deixavam Cadastros com sete itens e três significados diferentes, que é
 * onde uma lista deixa de ajudar a achar e passa a atrapalhar.
 *
 * Some por inteiro para quem não é gestor nem holding — ou seja, para a
 * maioria de quem vai usar o sistema. */
const grupos: { label: string | null; links: { href: string; label: string; icon: typeof LayoutDashboard; module: Module }[] }[] = [
  {
    label: null,
    links: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" }],
  },
  {
    label: "Movimento",
    links: [
      { href: "/transacoes", label: "Transações", icon: ArrowLeftRight, module: "transacoes" },
      { href: "/contas-a-pagar-receber", label: "A Pagar/Receber", icon: CalendarClock, module: "contas-a-pagar-receber" },
      { href: "/fechamento-caixa", label: "Fechamento de Caixa", icon: Wallet, module: "fechamento-caixa" },
    ],
  },
  {
    label: "Repasses médicos",
    links: [
      { href: "/repasses-medicos", label: "Lançamentos", icon: Stethoscope, module: "repasses-medicos" },
      { href: "/medicos", label: "Médicos", icon: Users, module: "medicos" },
      { href: "/operacao", label: "Operação", icon: ClipboardList, module: "operacao" },
    ],
  },
  {
    label: "Análise",
    links: [
      { href: "/relatorios", label: "Relatórios", icon: FileBarChart, module: "relatorios" },
      { href: "/balanco", label: "Balanço", icon: ScrollText, module: "balanco" },
    ],
  },
  {
    label: "Cadastros",
    links: [
      { href: "/categorias", label: "Categorias", icon: Tags, module: "categorias" },
      { href: "/fornecedores", label: "Fornecedores", icon: Truck, module: "fornecedores" },
      { href: "/contas-bancarias", label: "Contas Bancárias", icon: Landmark, module: "contas-bancarias" },
      { href: "/empresas", label: "Empresas", icon: Building2, module: "empresas" },
    ],
  },
  {
    label: "Administração",
    links: [
      { href: "/contas", label: "Contas de Acesso", icon: KeyRound, module: "contas" },
      { href: "/auditoria", label: "Auditoria", icon: History, module: "auditoria" },
      // "Erros", e não "Erros do Sistema": dentro de Administração o
      // complemento é redundante, e era o rótulo mais longo do menu. O nome
      // inteiro continua em MODULE_LABELS, que é o que aparece nas mensagens
      // de permissão — lá não existe o contexto do grupo para completar.
      { href: "/erros", label: "Erros", icon: Bug, module: "erros" },
    ],
  },
];

/** O menu recebe os módulos permitidos do layout, que é Server Component e
 * sabe quem está logado.
 *
 * Esconder um item é conveniência, nunca proteção — quem souber o endereço
 * digita. Cada página recusa por conta própria, no servidor. Um bloco some
 * inteiro quando nenhum item dele sobra, senão ficaria um título de seção
 * solto sobre o vazio. */
export function NavLinks({ modulos }: { modulos: Module[] }) {
  const pathname = usePathname();
  const permitidos = new Set(modulos);

  const visiveis = grupos
    .map((g) => ({ ...g, links: g.links.filter((l) => permitidos.has(l.module)) }))
    .filter((g) => g.links.length > 0);

  return (
    <>
      {visiveis.map((grupo, i) => (
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
