"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface Opcao {
  value: string;
  label: string;
}

/** Filtro do histórico.
 *
 * Na URL, como os outros filtros do sistema: compõe com a paginação, o
 * endereço é compartilhável, e a filtragem acontece no banco em vez de a
 * tela peneirar o que já baixou. */
export function AuditoriaFiltro({
  empresas,
  modulos,
}: {
  empresas: Opcao[] | { id: string; name: string }[];
  modulos: Opcao[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [busca, setBusca] = useState(params.get("q") ?? "");

  const opcoesEmpresa: Opcao[] = empresas.map((e) =>
    "value" in e ? e : { value: e.id, label: e.name }
  );

  function aplicar(mudancas: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(mudancas)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `/auditoria?${qs}` : "/auditoria");
  }

  const modulo = params.get("modulo") ?? "";
  const empresa = params.get("empresa") ?? "";
  const temFiltro = Boolean(busca || modulo || empresa);

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        aplicar({ q: busca });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="q">Buscar</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="q"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Pessoa, registro ou valor..."
            className="w-60 pl-8"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="modulo">Módulo</Label>
        <select
          id="modulo"
          value={modulo}
          onChange={(e) => aplicar({ modulo: e.target.value })}
          className="h-8 w-44 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="">Todos</option>
          {modulos.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {opcoesEmpresa.length > 1 && (
        <div className="space-y-1">
          <Label htmlFor="empresa">Unidade</Label>
          <select
            id="empresa"
            value={empresa}
            onChange={(e) => aplicar({ empresa: e.target.value })}
            className="h-8 w-44 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="">Todas</option>
            {opcoesEmpresa.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <Button type="submit" size="sm" variant="secondary">
        Filtrar
      </Button>
      {temFiltro && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setBusca("");
            router.push("/auditoria");
          }}
        >
          Limpar
        </Button>
      )}
    </form>
  );
}
