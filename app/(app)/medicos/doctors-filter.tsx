"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/** Filtro da lista de médicos.
 *
 * Vive na URL, não em estado local: assim compõe com a paginação (trocar de
 * página não perde o filtro), o endereço é compartilhável e o servidor pode
 * filtrar no banco em vez de mandar os 81 médicos para a tela peneirar. */
export function DoctorsFilter({ especialidades }: { especialidades: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [busca, setBusca] = useState(params.get("q") ?? "");

  function aplicar(mudancas: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(mudancas)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    // Qualquer mudança de filtro volta para a primeira página — senão dá
    // "nenhum resultado" só porque a página 4 não existe mais.
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `/medicos?${qs}` : "/medicos");
  }

  const status = params.get("status") ?? "";
  const especialidade = params.get("especialidade") ?? "";
  const conferir = params.get("conferir") === "1";
  const temFiltro = busca || status || especialidade || conferir;

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
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            id="q"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onBlur={() => aplicar({ q: busca })}
            placeholder="Buscar por nome..."
            className="pl-8 w-56"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="especialidade">Especialização</Label>
        <select
          id="especialidade"
          value={especialidade}
          onChange={(e) => aplicar({ especialidade: e.target.value })}
          className="h-9 w-52 rounded-lg border border-input bg-background text-foreground px-2.5 text-sm"
        >
          <option value="">Todas</option>
          {especialidades.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="status">Status</Label>
        <select
          id="status"
          value={status}
          onChange={(e) => aplicar({ status: e.target.value })}
          className="h-9 w-36 rounded-lg border border-input bg-background text-foreground px-2.5 text-sm"
        >
          <option value="">Todos</option>
          <option value="ativo">Ativos</option>
          <option value="inativo">Inativos</option>
        </select>
      </div>

      <Button
        type="button"
        size="sm"
        variant={conferir ? "default" : "outline"}
        onClick={() => aplicar({ conferir: conferir ? "" : "1" })}
      >
        Só contratos a conferir
      </Button>

      {temFiltro && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setBusca("");
            router.push("/medicos");
          }}
        >
          Limpar
        </Button>
      )}
    </form>
  );
}
