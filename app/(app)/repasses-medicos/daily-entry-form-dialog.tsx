"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { parseDateOnly, todayDateOnly } from "@/lib/date-only";
import { contractOn } from "@/lib/doctor-rates";
import { createDailyEntry, updateDailyEntry, type DailyEntryInput } from "./daily-entries-actions";

export interface DoctorOption {
  id: string;
  name: string;
  /** TODAS as versões do contrato, não só a vigente hoje. A tela resolve
   * qual vale na data escolhida, para somar o mesmo valor que o servidor
   * vai congelar. */
  serviceRates: {
    serviceItemId: string;
    serviceItemName: string;
    rate: number;
    payer: string | null;
    /** "YYYY-MM-DD" */
    validFrom: string;
  }[];
}

interface LineState {
  id: string;
  serviceItemId: string;
  quantity: string;
}

interface Props {
  doctors: DoctorOption[];
  entry?: {
    id: string;
    doctorId: string;
    date: Date;
    amount: number | null;
    paid: boolean;
    notes: string | null;
    lines: { id: string; serviceItemId: string; quantity: number }[];
  };
  /** Quando vem de fora, o diálogo é controlado e não desenha o próprio
   * gatilho — é assim que a tabela usa UM diálogo para todas as linhas em
   * vez de montar um por linha (com a base real seriam centenas, cada um
   * segurando a lista inteira de médicos e contratos). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function today() {
  return todayDateOnly();
}

export function DailyEntryFormDialog({ doctors, entry, open: openProp, onOpenChange }: Props) {
  const controlado = openProp !== undefined;
  const [openInterno, setOpenInterno] = useState(false);
  const open = controlado ? openProp : openInterno;
  const setOpen = (v: boolean) => (controlado ? onOpenChange?.(v) : setOpenInterno(v));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(0);

  const [doctorId, setDoctorId] = useState(entry?.doctorId ?? doctors[0]?.id ?? "");
  const [date, setDate] = useState(entry ? toDateInputValue(entry.date) : today());
  const [amount, setAmount] = useState(entry?.amount != null ? String(entry.amount) : "");
  const [paid, setPaid] = useState(entry?.paid ?? false);
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [lines, setLines] = useState<LineState[]>(
    entry?.lines.map((l) => ({ id: l.id, serviceItemId: l.serviceItemId, quantity: String(l.quantity) })) ?? []
  );

  const selectedDoctor = doctors.find((d) => d.id === doctorId);
  const detalhando = lines.length > 0;

  // O contrato que valia na data escolhida — não o de hoje. Trocar a data
  // reescreve os valores à vista, que é o mesmo critério do servidor.
  const contrato = useMemo(() => {
    if (!selectedDoctor) return [];
    const versoes = selectedDoctor.serviceRates.map((r) => ({
      ...r,
      validFromDate: parseDateOnly(r.validFrom),
    }));
    return contractOn(
      versoes.map((v) => ({ ...v, validFrom: v.validFromDate })),
      parseDateOnly(date || todayDateOnly())
    ).sort((a, b) => a.serviceItemName.localeCompare(b.serviceItemName));
  }, [selectedDoctor, date]);

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

  // Mesma conta da coluna "Valor" da planilha, só que somada pelo sistema.
  const totalDetalhado = useMemo(() => {
    if (!selectedDoctor) return 0;
    return lines.reduce((sum, l) => {
      const rate = contrato.find((r) => r.serviceItemId === l.serviceItemId)?.rate ?? 0;
      return sum + (Number(l.quantity) || 0) * rate;
    }, 0);
  }, [lines, selectedDoctor, contrato]);

  const valorDoDia = detalhando ? totalDetalhado : Number(amount) || 0;

  function reset() {
    setError(null);
    if (!entry) {
      setDoctorId(doctors[0]?.id ?? "");
      setDate(today());
      setAmount("");
      setPaid(false);
      setNotes("");
      setLines([]);
    }
  }

  function handleSubmit() {
    setError(null);
    const payload: DailyEntryInput = {
      doctorId,
      date,
      amount: detalhando ? undefined : Number(amount) || 0,
      paid,
      notes: notes || undefined,
      lines: lines
        .filter((l) => l.serviceItemId || l.quantity)
        .map((l) => ({ serviceItemId: l.serviceItemId, quantity: Number(l.quantity) || 0 })),
    };

    startTransition(async () => {
      const result = entry ? await updateDailyEntry(entry.id, payload) : await createDailyEntry(payload);
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success(entry ? "Lançamento atualizado." : "Lançamento salvo.");
      setOpen(false);
      reset();
    });
  }

  const contratoLabels = Object.fromEntries(
    contrato.map((r) => [r.serviceItemId, r.serviceItemName])
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      {!controlado &&
        (entry ? (
          <DialogTrigger render={<Button variant="ghost" size="icon" />}>
            <Pencil className="size-4" />
          </DialogTrigger>
        ) : (
          <DialogTrigger render={<Button />}>
            <Plus />
            Lançar repasse
          </DialogTrigger>
        ))}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{entry ? "Editar lançamento" : "Lançar dia de atendimento"}</DialogTitle>
          <DialogDescription>
            Informe o valor do dia, ou detalhe por item para o sistema somar pelo contrato — detalhando, as
            métricas de conversão passam a funcionar.
          </DialogDescription>
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
              <Label htmlFor="date">Data</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
          </div>

          {/* O contrato do médico, do mesmo jeito que a planilha mostra ao
              lado dos lançamentos — serve de consulta na hora de somar. */}
          {selectedDoctor && contrato.length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium mb-2 text-muted-foreground">
                Contrato de {selectedDoctor.name}
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                {contrato.map((r) => (
                  <div key={r.serviceItemId} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 truncate">
                      {r.serviceItemName}
                      {r.payer && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">
                          {r.payer === "CT" ? "CT" : "Part"}
                        </Badge>
                      )}
                    </span>
                    <span className="tabular-nums shrink-0">{formatCurrency(r.rate)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!detalhando && (
            <div className="space-y-2">
              <Label htmlFor="amount">Valor do dia (R$)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Ex: 332,00"
              />
              <p className="text-xs text-muted-foreground">
                É o total do dia, como na planilha. Se preferir detalhar, adicione os itens abaixo.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Detalhe por item (opcional)</Label>
            <div className="space-y-2">
              {lines.map((line) => {
                const rate = contrato.find(
                  (r) => r.serviceItemId === line.serviceItemId
                )?.rate;
                return (
                  <div key={line.id} className="flex items-center gap-2">
                    <Select
                      items={contratoLabels}
                      value={line.serviceItemId}
                      onValueChange={(v) => updateLine(line.id, "serviceItemId", v ?? "")}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Item do contrato" />
                      </SelectTrigger>
                      <SelectContent>
                        {contrato.map((r) => (
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
                    <span className="w-28 text-right text-sm text-muted-foreground tabular-nums">
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
                disabled={!selectedDoctor || contrato.length === 0}
              >
                <Plus className="size-4" />
                Adicionar item
              </Button>
              {selectedDoctor && contrato.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Esse médico não tem contrato cadastrado — edite o médico primeiro.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações (opcional)</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={paid} onCheckedChange={(c) => setPaid(Boolean(c))} />
            Já pago
          </label>

          <div className="rounded-lg border p-3 flex justify-between text-sm font-medium">
            <span>{detalhando ? "Valor do dia (somado pelo contrato)" : "Valor do dia"}</span>
            <span className="tabular-nums">{formatCurrency(valorDoDia)}</span>
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
