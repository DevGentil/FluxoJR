"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2, Pencil } from "lucide-react";
import { formatCurrency, toDateInputValue } from "@/lib/format";
import { createPeriodReport, updatePeriodReport, type PeriodReportInput } from "./reports-actions";

export interface DoctorOption {
  id: string;
  name: string;
  /** Só os itens que esse médico tem contratados — não dá para lançar um
   * item sem valor combinado com ele. */
  serviceRates: { serviceItemId: string; serviceItemName: string; rate: number }[];
}

interface LineState {
  id: string;
  serviceItemId: string;
  quantity: string;
}

interface Props {
  doctors: DoctorOption[];
  report?: {
    id: string;
    doctorId: string;
    competencia: Date;
    notes: string | null;
    lines: { id: string; serviceItemId: string; quantity: number }[];
  };
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function ReportFormDialog({ doctors, report }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(0);

  const [doctorId, setDoctorId] = useState(report?.doctorId ?? doctors[0]?.id ?? "");
  const [competencia, setCompetencia] = useState(
    report ? toDateInputValue(report.competencia).slice(0, 7) : currentMonth()
  );
  const [notes, setNotes] = useState(report?.notes ?? "");
  const [lines, setLines] = useState<LineState[]>(
    report?.lines.map((l) => ({ id: l.id, serviceItemId: l.serviceItemId, quantity: String(l.quantity) })) ?? []
  );

  const selectedDoctor = doctors.find((d) => d.id === doctorId);

  function newId() {
    nextId.current += 1;
    return `l${nextId.current}`;
  }

  function addLine() {
    setLines((prev) => [...prev, { id: newId(), serviceItemId: "", quantity: "" }]);
  }

  function updateLine(id: string, field: "serviceItemId" | "quantity", value: string) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  const total = useMemo(() => {
    if (!selectedDoctor) return 0;
    return lines.reduce((sum, l) => {
      const rate = selectedDoctor.serviceRates.find((r) => r.serviceItemId === l.serviceItemId)?.rate ?? 0;
      return sum + (Number(l.quantity) || 0) * rate;
    }, 0);
  }, [lines, selectedDoctor]);

  function reset() {
    setError(null);
    if (!report) {
      setDoctorId(doctors[0]?.id ?? "");
      setCompetencia(currentMonth());
      setNotes("");
      setLines([]);
    }
  }

  function handleSubmit() {
    setError(null);
    const payload: PeriodReportInput = {
      doctorId,
      competencia,
      notes: notes || undefined,
      lines: lines
        .filter((l) => l.serviceItemId || l.quantity)
        .map((l) => ({ serviceItemId: l.serviceItemId, quantity: Number(l.quantity) || 0 })),
    };

    startTransition(async () => {
      const result = report ? await updatePeriodReport(report.id, payload) : await createPeriodReport(payload);
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success(report ? "Repasse atualizado." : "Repasse salvo.");
      setOpen(false);
      reset();
    });
  }

  const contractLabels = Object.fromEntries(
    (selectedDoctor?.serviceRates ?? []).map((r) => [r.serviceItemId, r.serviceItemName])
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      {report ? (
        <DialogTrigger render={<Button variant="ghost" size="icon" />}>
          <Pencil className="size-4" />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button />}>
          <Plus />
          Novo repasse
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{report ? "Editar repasse" : "Novo repasse"}</DialogTitle>
          <DialogDescription>O que o médico fez no mês, item a item.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="doctorId">Médico</Label>
              <Select
                items={Object.fromEntries(doctors.map((d) => [d.id, d.name]))}
                value={doctorId}
                onValueChange={(v) => {
                  setDoctorId(v ?? "");
                  setLines([]);
                }}
                required
              >
                <SelectTrigger id="doctorId" className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {doctors.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="competencia">Mês</Label>
              <Input
                id="competencia"
                type="month"
                value={competencia}
                onChange={(e) => setCompetencia(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Itens do mês</Label>
            <div className="space-y-2">
              {lines.map((line) => {
                const rate = selectedDoctor?.serviceRates.find(
                  (r) => r.serviceItemId === line.serviceItemId
                )?.rate;
                return (
                  <div key={line.id} className="flex items-center gap-2">
                    <Select
                      items={contractLabels}
                      value={line.serviceItemId}
                      onValueChange={(v) => updateLine(line.id, "serviceItemId", v ?? "")}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Item" />
                      </SelectTrigger>
                      <SelectContent>
                        {(selectedDoctor?.serviceRates ?? []).map((r) => (
                          <SelectItem key={r.serviceItemId} value={r.serviceItemId}>
                            {r.serviceItemName} — {formatCurrency(r.rate)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      value={line.quantity}
                      onChange={(e) => updateLine(line.id, "quantity", e.target.value)}
                      placeholder="Qtd"
                      className="w-24"
                    />
                    <span className="w-24 text-right text-sm text-muted-foreground tabular-nums">
                      {rate !== undefined ? formatCurrency((Number(line.quantity) || 0) * rate) : "—"}
                    </span>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(line.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addLine}
                disabled={!selectedDoctor || selectedDoctor.serviceRates.length === 0}
              >
                <Plus className="size-4" />
                Adicionar item
              </Button>
              {selectedDoctor && selectedDoctor.serviceRates.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Esse médico não tem nenhum item contratado — edite o médico primeiro.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações (opcional)</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="rounded-lg border p-3 flex justify-between text-sm font-medium">
            <span>Valor total do repasse</span>
            <span className="tabular-nums">{formatCurrency(total)}</span>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
