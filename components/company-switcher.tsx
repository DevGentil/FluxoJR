"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectGroup as SelectOptGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";
import { setActiveScope } from "@/app/(app)/scope-actions";

interface CompanyOption {
  id: string;
  name: string;
}

interface GroupOption {
  id: string;
  name: string;
  companies: CompanyOption[];
}

interface Props {
  groups: GroupOption[];
  ungroupedCompanies: CompanyOption[];
  currentValue: string;
}

export function CompanySwitcher({ groups, ungroupedCompanies, currentValue }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const items: Record<string, string> = { all: "Holding (todas as empresas)" };
  for (const group of groups) {
    items[`group:${group.id}`] = `${group.name} (consolidado)`;
    for (const company of group.companies) items[`company:${company.id}`] = company.name;
  }
  for (const company of ungroupedCompanies) items[`company:${company.id}`] = company.name;

  function handleChange(value: string | null) {
    if (!value) return;
    startTransition(async () => {
      await setActiveScope(value);
      router.refresh();
    });
  }

  return (
    <Select items={items} value={currentValue} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger className="w-full justify-start gap-2">
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Holding (todas as empresas)</SelectItem>
        {groups.map((group) => (
          <SelectOptGroup key={group.id}>
            <SelectLabel>{group.name}</SelectLabel>
            <SelectItem value={`group:${group.id}`}>Consolidado</SelectItem>
            {group.companies.map((company) => (
              <SelectItem key={company.id} value={`company:${company.id}`}>
                {company.name}
              </SelectItem>
            ))}
          </SelectOptGroup>
        ))}
        {ungroupedCompanies.length > 0 && (
          <SelectOptGroup>
            {groups.length > 0 && <SelectLabel>Outras empresas</SelectLabel>}
            {ungroupedCompanies.map((company) => (
              <SelectItem key={company.id} value={`company:${company.id}`}>
                {company.name}
              </SelectItem>
            ))}
          </SelectOptGroup>
        )}
      </SelectContent>
    </Select>
  );
}
