import type { ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search } from "lucide-react";

/** Uma opção de um select do filtro. */
export interface OpcaoFiltro {
  value: string;
  label: string;
}

/** Cada campo do filtro, declarado pela tela que o usa. */
export type CampoFiltro =
  | { tipo: "busca"; name: string; label: string; placeholder?: string }
  | { tipo: "data"; name: string; label: string }
  | { tipo: "select"; name: string; label: string; opcoes: OpcaoFiltro[]; vazio?: string }
  | { tipo: "valor"; name: string; label: string; placeholder?: string };

interface Props {
  campos: CampoFiltro[];
  /** Os valores atuais, vindos do endereço. */
  valores: Record<string, string | undefined>;
  /** Para onde o botão "Limpar" volta. */
  basePath: string;
  /** Fica ao lado dos botões — usado para "3 de 20" e afins. */
  resumo?: ReactNode;
}

const CLASSE_SELECT =
  "h-8 w-44 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground";

/** A barra de filtros das tabelas.
 *
 * É um `<form method="GET">` e não estado no cliente por três razões que se
 * somam: o filtro vira endereço (dá para mandar "olha esses vencidos" por
 * mensagem), sobrevive ao F5, e a consulta roda no banco — filtrar em
 * memória depois de paginar mostraria páginas vazias.
 *
 * Cada tela declara os campos que fazem sentido nela em vez de herdar uma
 * lista genérica: filtro que não corta nada é ruído ocupando a largura que
 * a tabela precisa. */
export function FiltrosTabela({ campos, valores, basePath, resumo }: Props) {
  // A key remonta os campos quando o filtro muda. Sem ela, o mesmo input
  // recebe um `defaultValue` novo depois de montado, e o Base UI avisa que
  // o campo passou de não-controlado para controlado.
  const chave = campos.map((c) => valores[c.name] ?? "").join("|");
  const ativo = campos.some((c) => (valores[c.name] ?? "") !== "");

  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-base">Filtros</CardTitle>
      </CardHeader>
      <CardContent>
        <form key={chave} method="GET" className="flex flex-wrap items-end gap-3">
          {campos.map((campo) => (
            <div key={campo.name} className="space-y-1">
              <Label htmlFor={campo.name}>{campo.label}</Label>

              {campo.tipo === "select" ? (
                <select
                  id={campo.name}
                  name={campo.name}
                  defaultValue={valores[campo.name] ?? ""}
                  className={CLASSE_SELECT}
                >
                  <option value="">{campo.vazio ?? "Todos"}</option>
                  {campo.opcoes.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : campo.tipo === "data" ? (
                <Input
                  id={campo.name}
                  name={campo.name}
                  type="date"
                  defaultValue={valores[campo.name] ?? ""}
                  className="w-40"
                />
              ) : campo.tipo === "valor" ? (
                <Input
                  id={campo.name}
                  name={campo.name}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={campo.placeholder}
                  defaultValue={valores[campo.name] ?? ""}
                  className="w-32"
                />
              ) : (
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id={campo.name}
                    name={campo.name}
                    placeholder={campo.placeholder}
                    defaultValue={valores[campo.name] ?? ""}
                    className="w-52 pl-8"
                  />
                </div>
              )}
            </div>
          ))}

          <Button type="submit" size="sm">
            Filtrar
          </Button>

          {/* "Limpar" só aparece quando há o que limpar — botão que não faz
              nada ensina a ignorar os que fazem. */}
          {ativo && (
            <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={basePath} />}>
              Limpar
            </Button>
          )}

          {resumo && <span className="ml-auto text-xs text-muted-foreground">{resumo}</span>}
        </form>
      </CardContent>
    </Card>
  );
}
