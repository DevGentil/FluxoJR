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
} from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transacoes", label: "Transações", icon: ArrowLeftRight },
  { href: "/contas-a-pagar-receber", label: "A Pagar/Receber", icon: CalendarClock },
  { href: "/fechamento-caixa", label: "Fechamento de Caixa", icon: Wallet },
  { href: "/categorias", label: "Categorias", icon: Tags },
  { href: "/fornecedores", label: "Fornecedores", icon: Truck },
  { href: "/repasses-medicos", label: "Repasses Médicos", icon: Stethoscope },
  { href: "/contas-bancarias", label: "Contas Bancárias", icon: Landmark },
  { href: "/relatorios", label: "Relatórios", icon: FileBarChart },
  { href: "/balanco", label: "Balanço", icon: ScrollText },
  { href: "/empresas", label: "Empresas", icon: Building2 },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <SidebarMenu>
      {links.map(({ href, label, icon: Icon }) => (
        <SidebarMenuItem key={href}>
          <SidebarMenuButton isActive={pathname === href} render={<Link href={href} />}>
            <Icon />
            <span>{label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
