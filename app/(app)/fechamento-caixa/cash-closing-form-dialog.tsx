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
import { createCashClosing, removerAnexoFechamento, updateCashClosing } from "./actions";
import { CampoAnexos, type AnexoSalvo } from "@/components/campo-anexos";
import { DiferencaValue } from "./cash-closing-summary";

interface AccountOption {
  id: string;
  name: string;
}

interface Line {
  id: string;
  label: string;
  amount: string;
}

interface Props {
  accounts: AccountOption[];
  closing?: {
    id: string;
    date: Date;
    accountId: string;
    countedCash: number;
    notes: string | null;
    sangrias: { id: string; label: string; amount: number }[];
    pagamentos: { id: string; label: string; amount: number }[];
    anexos?: AnexoSalvo[];
  };
}

function toLines(rows?: { id: string; label: string; amount: number }[]): Line[] {
  if (!rows || rows.length === 0) return [];
  return rows.map((r) => ({ id: r.id, label: r.label, amount: String(r.amount) }));
}

export function CashClosingFormDialog({ accounts, closing }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(0);

  const [date, setDate] = useState(closing ? toDateInputValue(closing.date) : toDateInputValue(new Date()));
  const [accountId, setAccountId] = useState(closing?.accountId ?? accounts[0]?.id ?? "");
  const [countedCash, setCountedCash] = useState(closing ? String(closing.countedCash) : "");
  const [notes, setNotes] = useState(closing?.notes ?? "");
  const [sangrias, setSangrias] = useState<Line[]>(
    toLines(closing?.sangrias).length > 0 ? toLines(closing?.sangrias) : [{ id: "s0", label: "", amount: "" }]
  );
  const [pagamentos, setPagamentos] = useState<Line[]>(toLines(closing?.pagamentos));
  const [arquivos, setArquivos] = useState<File[]>([]);

  function newId(prefix: string) {
    nextId.current += 1;
    return `${prefix}${nextId.current}`;
  }

  function addLine(setter: (fn: (prev: Line[]) => Line[]) => void, prefix: string) {
    setter((prev) => [...prev, { id: newId(prefix), label: "", amount: "" }]);
  }

  function updateLine(setter: (fn: (prev: Line[]) => Line[]) => void, id: string, field: "label" | "amount", value: string) {
    setter((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  }

  function removeLine(setter: (fn: (prev: Line[]) => Line[]) => void, id: string) {
    setter((prev) => prev.filter((l) => l.id !== id));
  }

  const totalSangrias = useMemo(
    () => sangrias.reduce((s, l) => s + (Number(l.amount) || 0), 0),
    [sangrias]
  );
  const totalPagamentos = useMemo(
    () => pagamentos.reduce((s, l) => s + (Number(l.amount) || 0), 0),
    [pagamentos]
  );
  const valorCaixa = totalSangrias - totalPagamentos;
  const diferenca = (Number(countedCash) || 0) - valorCaixa;

  function reset() {
    setError(null);
    if (!closing) {
      setDate(toDateInputValue(new Date()));
      setAccountId(accounts[0]?.id ?? "");
      setCountedCash("");
      setNotes("");
      setSangrias([{ id: "s0", label: "", amount: "" }]);
      setPagamentos([]);
      setArquivos([]);
    }
  }

  function handleSubmit() {
    setError(null);
    const sangriaLines = sangrias
      .filter((l) => l.label.trim() || l.amount)
      .map((l) => ({ label: l.label, amount: Number(l.amount) }));
    const pagamentoLines = pagamentos
      .filter((l) => l.label.trim() || l.amount)
      .map((l) => ({ label: l.label, amount: Number(l.amount) }));
    const payload = {
      date,
      accountId,
      countedCash: Number(countedCash),
      notes: notes || undefined,
      sangrias: sangriaLines,
      pagamentos: pagamentoLines,
      anexos: arquivos,
    };

    startTransition(async () => {
      const result = closing ? await updateCashClosing(closing.id, payload) : await createCashClosing(payload);
      if (result.error) {
        setError(result.error);
        return;
      }
      // Fecha e pronto, sem resumo. Quem quiser conferir o que ficou
      // gravado clica na linha — que e a mesma tela, com o dado ja salvo em
      // vez de uma copia do que acabou de ser digitado.
      toast.success(closing ? "Fechamento atualizado." : "Fechamento salvo. Aguardando aprovação do financeiro.");
      setOpen(false);
      reset();
    });
  }

  function renderLines(
    lines: Line[],
    setter: (fn: (prev: Line[]) => Line[]) => void,
    prefix: string,
    placeholder: string
  ) {
    return (
      <div className="space-y-2">
        {lines.map((line) => (
          <div key={line.id} className="flex items-center gap-2">
            <Input
              value={line.label}
              onChange={(e) => updateLine(setter, line.id, "label", e.target.value)}
              placeholder={placeholder}
              className="flex-1"
            />
            <Input
              type="number"
              step="0.01"
              min="0"
              value={line.amount}
              onChange={(e) => updateLine(setter, line.id, "amount", e.target.value)}
              placeholder="R$"
              className="w-32"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeLine(setter, line.id)}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => addLine(setter, prefix)}>
          <Plus className="size-4" />
          Adicionar linha
        </Button>
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      {closing ? (
        <DialogTrigger render={<Button variant="ghost" size="icon" />}>
          <Pencil className="size-4" />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button />}>
          <Plus />
          Novo fechamento
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-2xl">
          <>
            <DialogHeader>
              <DialogTitle>{closing ? "Editar fechamento de caixa" : "Novo fechamento de caixa"}</DialogTitle>
              <DialogDescription>
                Sangrias de cada caixa individual e pagamentos em dinheiro do dia, confrontados com a contagem
                física.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Data</Label>
                  <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountId">Conta</Label>
                  <Select
                    name="accountId"
                    items={Object.fromEntries(accounts.map((a) => [a.id, a.name]))}
                    value={accountId}
                    onValueChange={(v) => setAccountId(v ?? "")}
                    required
                  >
                    <SelectTrigger id="accountId" className="w-full">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Sangrias (dinheiro retirado de cada caixa)</Label>
                {renderLines(sangrias, setSangrias, "s", "Ex: CX Anna Carolina")}
              </div>

              <div className="space-y-2">
                <Label>Pagamentos (saídas em dinheiro do dia)</Label>
                {renderLines(pagamentos, setPagamentos, "p", "Ex: Fornecedor X")}
              </div>

              <div className="space-y-2">
                <Label htmlFor="countedCash">Dinheiro contado (fisicamente)</Label>
                <Input
                  id="countedCash"
                  type="number"
                  step="0.01"
                  value={countedCash}
                  onChange={(e) => setCountedCash(e.target.value)}
                  placeholder="R$"
                  required
                />
              </div>

              {/* Logo abaixo dos pagamentos: e o pagamento em dinheiro que
                  costuma vir com nota ou recibo na mao. */}
              <CampoAnexos
                existentes={closing?.anexos}
                aoRemover={closing ? removerAnexoFechamento : undefined}
                aoEscolherArquivos={setArquivos}
              />

              <div className="space-y-2">
                <Label htmlFor="notes">Observações (opcional)</Label>
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              <div className="rounded-lg border p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total sangrias</span>
                  <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(totalSangrias)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total pagamentos</span>
                  <span className="tabular-nums text-red-600 dark:text-red-400">
                    {formatCurrency(totalPagamentos)}
                  </span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Valor do caixa (calculado)</span>
                  <span className="tabular-nums">{formatCurrency(valorCaixa)}</span>
                </div>
                <div className="flex justify-between items-center font-medium">
                  <span>Diferença (contado − calculado)</span>
                  <DiferencaValue diferenca={diferenca} />
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <DialogFooter>
              <Button onClick={handleSubmit} disabled={isPending}>
                {isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </>
      </DialogContent>
    </Dialog>
  );
}
