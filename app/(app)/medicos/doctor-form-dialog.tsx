"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { createDoctor, updateDoctor, type DoctorInput } from "./doctors-actions";
import { todayDateOnly } from "@/lib/date-only";
import { formatDate } from "@/lib/format";

export interface ServiceItemOption {
  id: string;
  name: string;
}

interface RateLine {
  id: string;
  serviceItemId: string;
  rate: string;
  /** O valor com que a linha abriu. Comparar com `rate` é o que diz se
   * houve reajuste — e só então a vigência precisa ser perguntada. */
  originalRate: string;
  /** Desde quando o valor ATUAL vale, para mostrar embaixo da linha. */
  currentValidFrom: string | null;
  /** Desde quando o valor NOVO passa a valer. */
  validFrom: string;
}

interface Props {
  serviceItems: ServiceItemOption[];
  doctor?: {
    id: string;
    name: string;
    specialty: string;
    paymentMethod: string | null;
    active: boolean;
    notes: string | null;
    serviceRates: { id: string; serviceItemId: string; rate: number; validFrom: string }[];
  };
}

function hojeISO() {
  return todayDateOnly();
}

export function DoctorFormDialog({ serviceItems, doctor }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(0);

  const [name, setName] = useState(doctor?.name ?? "");
  const [specialty, setSpecialty] = useState(doctor?.specialty ?? "");
  const [paymentMethod, setPaymentMethod] = useState(doctor?.paymentMethod ?? "");
  const [active, setActive] = useState(doctor?.active ?? true);
  const [notes, setNotes] = useState(doctor?.notes ?? "");
  const [rates, setRates] = useState<RateLine[]>(
    doctor?.serviceRates.map((r) => ({
      id: r.id,
      serviceItemId: r.serviceItemId,
      rate: String(r.rate),
      originalRate: String(r.rate),
      currentValidFrom: r.validFrom,
      validFrom: hojeISO(),
    })) ?? []
  );

  function newId() {
    nextId.current += 1;
    return `r${nextId.current}`;
  }

  function addRate() {
    setRates((prev) => [
      ...prev,
      {
        id: newId(),
        serviceItemId: "",
        rate: "",
        originalRate: "",
        currentValidFrom: null,
        validFrom: hojeISO(),
      },
    ]);
  }

  function updateRate(id: string, field: "serviceItemId" | "rate" | "validFrom", value: string) {
    setRates((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  /** Linha de contrato que já existia e teve o valor mexido: é um reajuste,
   * e só aí a data de início importa. Linha nova vale a partir de hoje. */
  function isReajuste(line: RateLine) {
    return line.currentValidFrom != null && line.rate !== line.originalRate;
  }

  /** Reajuste datado ANTES da vigência do valor atual não passa a valer:
   * ele entra no histórico, mas quem continua vigente é o valor de hoje.
   * É fácil cair nisso sem perceber ao corrigir um valor "para trás". */
  function reajusteNaoVigora(line: RateLine) {
    return isReajuste(line) && line.currentValidFrom != null && line.validFrom < line.currentValidFrom;
  }

  function removeRate(id: string) {
    setRates((prev) => prev.filter((r) => r.id !== id));
  }

  function reset() {
    setError(null);
    if (!doctor) {
      setName("");
      setSpecialty("");
      setPaymentMethod("");
      setActive(true);
      setNotes("");
      setRates([]);
    }
  }

  function handleSubmit() {
    setError(null);
    const payload: DoctorInput = {
      name,
      specialty,
      paymentMethod: paymentMethod || undefined,
      active,
      notes: notes || undefined,
      serviceRates: rates
        .filter((r) => r.serviceItemId || r.rate)
        .map((r) => ({
          serviceItemId: r.serviceItemId,
          rate: Number(r.rate),
          validFrom: isReajuste(r) ? r.validFrom : undefined,
        })),
    };

    startTransition(async () => {
      const result = doctor ? await updateDoctor(doctor.id, payload) : await createDoctor(payload);
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success(doctor ? "Médico atualizado." : "Médico cadastrado.");
      setOpen(false);
      reset();
    });
  }

  const itemLabels = Object.fromEntries(serviceItems.map((s) => [s.id, s.name]));

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      {doctor ? (
        <DialogTrigger render={<Button variant="ghost" size="icon" />}>
          <Pencil className="size-4" />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button />}>
          <Plus />
          Novo médico
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{doctor ? "Editar médico" : "Novo médico"}</DialogTitle>
          <DialogDescription>
            O contrato é a lista do que ele recebe. Um médico pode combinar consulta, exame, procedimento e
            plantão — inclua só os itens que se aplicam a ele.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="specialty">Especialização</Label>
              <Input
                id="specialty"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                placeholder="Ex: Pediatra"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Forma de pagamento</Label>
              <Input
                id="paymentMethod"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                placeholder="Ex: PIX"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Contrato de repasse</Label>
            <div className="space-y-2">
              {rates.map((line) => (
                <div key={line.id} className="space-y-1">
                  <div className="flex items-center gap-2">
                  <Select
                    items={itemLabels}
                    value={line.serviceItemId}
                    onValueChange={(v) => updateRate(line.id, "serviceItemId", v ?? "")}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Item do catálogo" />
                    </SelectTrigger>
                    <SelectContent>
                      {serviceItems.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.rate}
                    onChange={(e) => updateRate(line.id, "rate", e.target.value)}
                    placeholder="R$"
                    className="w-28"
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeRate(line.id)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                  </div>
                  {line.currentValidFrom && !isReajuste(line) && (
                    <p className="text-xs text-muted-foreground pl-1">
                      Vigente desde {formatDate(line.currentValidFrom)}
                    </p>
                  )}
                  {isReajuste(line) && (
                    <div className="flex items-center gap-2 pl-1">
                      <span className="text-xs text-muted-foreground shrink-0">Reajuste vale a partir de</span>
                      <Input
                        type="date"
                        value={line.validFrom}
                        onChange={(e) => updateRate(line.id, "validFrom", e.target.value)}
                        className="h-8 w-40"
                      />
                      <span className="text-xs text-muted-foreground">
                        (o valor de {line.originalRate ? `R$ ${line.originalRate}` : "antes"} fica no histórico)
                      </span>
                    </div>
                  )}
                  {reajusteNaoVigora(line) && (
                    <p className="text-xs text-amber-600 dark:text-amber-500 pl-1">
                      Essa data é anterior à vigência atual ({formatDate(line.currentValidFrom!)}), então o
                      valor que continua valendo hoje é R$ {line.originalRate}. Use uma data igual ou
                      posterior para o reajuste passar a valer.
                    </p>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addRate}
                disabled={serviceItems.length === 0}
              >
                <Plus className="size-4" />
                Adicionar item
              </Button>
              {serviceItems.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Cadastre um item no catálogo de procedimentos primeiro.
                </p>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={active} onCheckedChange={(c) => setActive(Boolean(c))} />
            Médico ativo
          </label>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações (opcional)</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
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
