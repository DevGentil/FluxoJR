"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import {
  parseSpreadsheetFile,
  normalizeAmount,
  normalizeDate,
  type ParsedFile,
} from "@/lib/import-parse";
import { importTransactions } from "./actions";
import { formatCurrency, formatDate } from "@/lib/format";

interface Option {
  id: string;
  name: string;
}

interface Props {
  accounts: Option[];
  categories: Option[];
}

const NONE = "__none__";

export function ImportDialog({ accounts, categories }: Props) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [dateCol, setDateCol] = useState("");
  const [descCol, setDescCol] = useState("");
  const [amountCol, setAmountCol] = useState("");
  const [typeCol, setTypeCol] = useState(NONE);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState(NONE);
  const [importing, setImporting] = useState(false);

  function reset() {
    setFileName("");
    setParsed(null);
    setDateCol("");
    setDescCol("");
    setAmountCol("");
    setTypeCol(NONE);
  }

  async function handleFile(file: File) {
    try {
      const result = await parseSpreadsheetFile(file);
      setFileName(file.name);
      setParsed(result);
      const headers = result.headers;
      setDateCol(headers.find((h) => /data/i.test(h)) ?? headers[0] ?? "");
      setDescCol(headers.find((h) => /descri|hist[oó]rico/i.test(h)) ?? headers[1] ?? "");
      setAmountCol(headers.find((h) => /valor|montante/i.test(h)) ?? headers[2] ?? "");
      const foundTypeCol = headers.find((h) => /tipo/i.test(h));
      setTypeCol(foundTypeCol ?? NONE);
    } catch {
      toast.error("Não foi possível ler o arquivo. Confira se é um CSV ou Excel válido.");
    }
  }

  const preview = useMemo(() => {
    if (!parsed || !dateCol || !descCol || !amountCol) return [];
    return parsed.rows.slice(0, 300).map((row) => {
      const rawAmount = normalizeAmount(row[amountCol]);
      const date = normalizeDate(row[dateCol]);
      const description = String(row[descCol] ?? "").trim();
      let type: "INCOME" | "EXPENSE" | null = null;
      if (typeCol !== NONE) {
        const t = String(row[typeCol] ?? "").toLowerCase();
        type = /entra|receb|income|credit/.test(t) ? "INCOME" : "EXPENSE";
      } else if (rawAmount !== null) {
        type = rawAmount >= 0 ? "INCOME" : "EXPENSE";
      }
      const valid = Boolean(date && description && rawAmount !== null && type);
      return { date, description, amount: rawAmount, type, valid };
    });
  }, [parsed, dateCol, descCol, amountCol, typeCol]);

  const validRows = preview.filter((r) => r.valid);

  const headerItems = useMemo(
    () => Object.fromEntries((parsed?.headers ?? []).map((h) => [h, h])),
    [parsed]
  );
  const typeColItems = useMemo(
    () => ({ [NONE]: "Inferir pelo sinal do valor", ...headerItems }),
    [headerItems]
  );
  const accountItems = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, a.name])),
    [accounts]
  );
  const categoryItems = useMemo(
    () => ({ [NONE]: "Sem categoria", ...Object.fromEntries(categories.map((c) => [c.id, c.name])) }),
    [categories]
  );

  async function handleConfirm() {
    if (!accountId || validRows.length === 0) return;
    setImporting(true);
    try {
      const result = await importTransactions({
        fileName,
        accountId,
        categoryId: categoryId === NONE ? undefined : categoryId,
        rows: validRows.map((r) => ({
          date: r.date!,
          amount: r.amount!,
          type: r.type!,
          description: r.description,
        })),
      });
      toast.success(`${result.imported} transações importadas com sucesso.`);
      setOpen(false);
      reset();
    } catch {
      toast.error("Falha ao importar as transações.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <Upload />
        Importar
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar transações</DialogTitle>
          <DialogDescription>
            Envie um extrato em CSV ou Excel. Mapeie as colunas e confira o preview antes de confirmar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file">Arquivo (CSV ou XLSX)</Label>
            <Input
              id="file"
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>

          {parsed && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Coluna de data</Label>
                  <Select items={headerItems} value={dateCol} onValueChange={(v) => setDateCol(v ?? "")}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {parsed.headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Coluna de descrição</Label>
                  <Select items={headerItems} value={descCol} onValueChange={(v) => setDescCol(v ?? "")}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {parsed.headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Coluna de valor</Label>
                  <Select items={headerItems} value={amountCol} onValueChange={(v) => setAmountCol(v ?? "")}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {parsed.headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Coluna de tipo (opcional)</Label>
                  <Select items={typeColItems} value={typeCol} onValueChange={(v) => setTypeCol(v ?? NONE)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Inferir pelo sinal do valor</SelectItem>
                      {parsed.headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Conta de destino</Label>
                  <Select items={accountItems} value={accountId} onValueChange={(v) => setAccountId(v ?? "")}>
                    <SelectTrigger className="w-full">
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
                <div className="space-y-2">
                  <Label>Categoria (aplicada a todas)</Label>
                  <Select items={categoryItems} value={categoryId} onValueChange={(v) => setCategoryId(v ?? NONE)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sem categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem categoria</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-lg border">
                <div className="max-h-64 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Tipo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.slice(0, 10).map((row, i) => (
                        <TableRow key={i} className={!row.valid ? "opacity-50" : ""}>
                          <TableCell>{row.date ? formatDate(row.date) : "inválida"}</TableCell>
                          <TableCell>{row.description || "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.amount !== null ? formatCurrency(Math.abs(row.amount)) : "—"}
                          </TableCell>
                          <TableCell>{row.type === "INCOME" ? "Entrada" : row.type === "EXPENSE" ? "Saída" : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {validRows.length} de {preview.length} linhas prontas para importar
                {preview.length > 10 ? " (mostrando as 10 primeiras)" : ""}.
              </p>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={handleConfirm}
            disabled={!parsed || validRows.length === 0 || !accountId || importing}
          >
            {importing ? "Importando..." : `Importar ${validRows.length} transações`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
