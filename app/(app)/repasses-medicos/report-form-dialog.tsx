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

interface DoctorOption {
  id: string;
  name: string;
  consultationRate: number;
  examRates: { examTypeId: string; examTypeName: string; rate: number }[];
}

interface ExamCountLine {
  id: string;
  examTypeId: string;
  count: string;
}

interface Props {
  doctors: DoctorOption[];
  report?: {
    id: string;
    doctorId: string;
    competencia: Date;
    consultationCount: number;
    notes: string | null;
    examCounts: { id: string; examTypeId: string; count: number }[];
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
  const [consultationCount, setConsultationCount] = useState(
    report ? String(report.consultationCount) : ""
  );
  const [notes, setNotes] = useState(report?.notes ?? "");
  const [examLines, setExamLines] = useState<ExamCountLine[]>(
    report?.examCounts.map((e) => ({ id: e.id, examTypeId: e.examTypeId, count: String(e.count) })) ?? []
  );

  const selectedDoctor = doctors.find((d) => d.id === doctorId);

  function newId() {
    nextId.current += 1;
    return `e${nextId.current}`;
  }

  function addLine() {
    setExamLines((prev) => [...prev, { id: newId(), examTypeId: "", count: "" }]);
  }

  function updateLine(id: string, field: "examTypeId" | "count", value: string) {
    setExamLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  }

  function removeLine(id: string) {
    setExamLines((prev) => prev.filter((l) => l.id !== id));
  }

  const consultationValue = (Number(consultationCount) || 0) * (selectedDoctor?.consultationRate ?? 0);
  const examValue = useMemo(() => {
    if (!selectedDoctor) return 0;
    return examLines.reduce((sum, l) => {
      const rate = selectedDoctor.examRates.find((r) => r.examTypeId === l.examTypeId)?.rate ?? 0;
      return sum + (Number(l.count) || 0) * rate;
    }, 0);
  }, [examLines, selectedDoctor]);
  const totalValue = consultationValue + examValue;

  function reset() {
    setError(null);
    if (!report) {
      setDoctorId(doctors[0]?.id ?? "");
      setCompetencia(currentMonth());
      setConsultationCount("");
      setNotes("");
      setExamLines([]);
    }
  }

  function handleSubmit() {
    setError(null);
    const payload: PeriodReportInput = {
      doctorId,
      competencia,
      consultationCount: Number(consultationCount) || 0,
      notes: notes || undefined,
      examCounts: examLines
        .filter((l) => l.examTypeId || l.count)
        .map((l) => ({ examTypeId: l.examTypeId, count: Number(l.count) || 0 })),
    };

    startTransition(async () => {
      const result = report
        ? await updatePeriodReport(report.id, payload)
        : await createPeriodReport(payload);
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success(report ? "Repasse atualizado." : "Repasse salvo.");
      setOpen(false);
      reset();
    });
  }

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
          <DialogDescription>Total de consultas e exames de um médico num mês.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="doctorId">Médico</Label>
              <Select
                items={Object.fromEntries(doctors.map((d) => [d.id, d.name]))}
                value={doctorId}
                onValueChange={(v) => setDoctorId(v ?? "")}
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
            <Label htmlFor="consultationCount">
              Quantidade de consultas (R$ {selectedDoctor ? formatCurrency(selectedDoctor.consultationRate) : "—"}
              /consulta)
            </Label>
            <Input
              id="consultationCount"
              type="number"
              min="0"
              step="1"
              value={consultationCount}
              onChange={(e) => setConsultationCount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Exames</Label>
            <div className="space-y-2">
              {examLines.map((line) => {
                const rate = selectedDoctor?.examRates.find((r) => r.examTypeId === line.examTypeId)?.rate;
                return (
                  <div key={line.id} className="flex items-center gap-2">
                    <Select
                      items={Object.fromEntries(
                        (selectedDoctor?.examRates ?? []).map((r) => [r.examTypeId, r.examTypeName])
                      )}
                      value={line.examTypeId}
                      onValueChange={(v) => updateLine(line.id, "examTypeId", v ?? "")}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Tipo de exame" />
                      </SelectTrigger>
                      <SelectContent>
                        {(selectedDoctor?.examRates ?? []).map((r) => (
                          <SelectItem key={r.examTypeId} value={r.examTypeId}>
                            {r.examTypeName} — {formatCurrency(r.rate)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={line.count}
                      onChange={(e) => updateLine(line.id, "count", e.target.value)}
                      placeholder="Qtd"
                      className="w-20"
                    />
                    <span className="w-24 text-right text-sm text-muted-foreground tabular-nums">
                      {rate !== undefined ? formatCurrency((Number(line.count) || 0) * rate) : "—"}
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
                disabled={!selectedDoctor || selectedDoctor.examRates.length === 0}
              >
                <Plus className="size-4" />
                Adicionar exame
              </Button>
              {selectedDoctor && selectedDoctor.examRates.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Esse médico não tem taxas de exame cadastradas — edite o médico primeiro.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações (opcional)</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="rounded-lg border p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor de consultas</span>
              <span className="tabular-nums">{formatCurrency(consultationValue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor de exames</span>
              <span className="tabular-nums">{formatCurrency(examValue)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Valor total do repasse</span>
              <span className="tabular-nums">{formatCurrency(totalValue)}</span>
            </div>
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
