"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatMonth } from "@/lib/format";

/** Filtro dos lançamentos de um médico: mês e situação de pagamento.
 *
 * Só esses dois porque são os que a conferência usa — fecha-se o repasse de
 * um mês, e procura-se o que ainda está em aberto. Fica na URL para compor
 * com a paginação. */
export function DoctorEntriesFilter({ doctorId, meses }: { doctorId: string; meses: string[] }) {
  const router = useRouter();
  const params = useSearchParams();

  function aplicar(mudancas: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(mudancas)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `/medicos/${doctorId}?${qs}` : `/medicos/${doctorId}`);
  }

  const mes = params.get("mes") ?? "";
  const pago = params.get("pago") ?? "";

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="mes">Mês</Label>
        <select
          id="mes"
          value={mes}
          onChange={(e) => aplicar({ mes: e.target.value })}
          className="h-9 w-48 rounded-lg border border-input bg-transparent px-2.5 text-sm [&>option]:first-letter:uppercase"
        >
          <option value="">Todos</option>
          {meses.map((m) => (
            <option key={m} value={m}>
              {formatMonth(m)}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="pago">Situação</Label>
        <select
          id="pago"
          value={pago}
          onChange={(e) => aplicar({ pago: e.target.value })}
          className="h-9 w-40 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="">Todas</option>
          <option value="nao">Em aberto</option>
          <option value="sim">Pagos</option>
        </select>
      </div>

      {(mes || pago) && (
        <Button type="button" size="sm" variant="ghost" onClick={() => router.push(`/medicos/${doctorId}`)}>
          Limpar
        </Button>
      )}
    </div>
  );
}
