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

export interface ServiceItemOption {
  id: string;
  name: string;
}

interface RateLine {
  id: string;
  serviceItemId: string;
  rate: string;
}

interface Props {
  serviceItems: ServiceItemOption[];
  doctor?: {
    id: string;
    name: string;
    specialty: string;
    document: string | null;
    paymentMethod: string | null;
    active: boolean;
    notes: string | null;
    serviceRates: { id: string; serviceItemId: string; rate: number }[];
  };
}

export function DoctorFormDialog({ serviceItems, doctor }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(0);

  const [name, setName] = useState(doctor?.name ?? "");
  const [specialty, setSpecialty] = useState(doctor?.specialty ?? "");
  const [document, setDocument] = useState(doctor?.document ?? "");
  const [paymentMethod, setPaymentMethod] = useState(doctor?.paymentMethod ?? "");
  const [active, setActive] = useState(doctor?.active ?? true);
  const [notes, setNotes] = useState(doctor?.notes ?? "");
  const [rates, setRates] = useState<RateLine[]>(
    doctor?.serviceRates.map((r) => ({ id: r.id, serviceItemId: r.serviceItemId, rate: String(r.rate) })) ?? []
  );

  function newId() {
    nextId.current += 1;
    return `r${nextId.current}`;
  }

  function addRate() {
    setRates((prev) => [...prev, { id: newId(), serviceItemId: "", rate: "" }]);
  }

  function updateRate(id: string, field: "serviceItemId" | "rate", value: string) {
    setRates((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function removeRate(id: string) {
    setRates((prev) => prev.filter((r) => r.id !== id));
  }

  function reset() {
    setError(null);
    if (!doctor) {
      setName("");
      setSpecialty("");
      setDocument("");
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
      document: document || undefined,
      paymentMethod: paymentMethod || undefined,
      active,
      notes: notes || undefined,
      serviceRates: rates
        .filter((r) => r.serviceItemId || r.rate)
        .map((r) => ({ serviceItemId: r.serviceItemId, rate: Number(r.rate) })),
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
              <Label htmlFor="document">CRM</Label>
              <Input id="document" value={document} onChange={(e) => setDocument(e.target.value)} />
            </div>
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
                <div key={line.id} className="flex items-center gap-2">
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
