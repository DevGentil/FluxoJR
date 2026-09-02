import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  /** Total de registros que batem com o filtro, não os desta página. */
  total: number;
  page: number;
  pageSize: number;
  /** Caminho da tela, sem query. */
  basePath: string;
  /** Filtros atuais, preservados na troca de página. */
  params: Record<string, string | undefined>;
  /** Nome do parâmetro de página na URL. Só precisa mudar quando a mesma
   * tela pagina duas listas ao mesmo tempo — A Pagar e A Receber, por
   * exemplo, que dividem o endereço e não podem dividir a página. */
  paramName?: string;
  /** Nome do que está sendo contado, para a linha "1–30 de 412 lançamentos".
   * Sem ele a contagem é só um número solto. */
  rotulo?: string;
}

function hrefFor(
  basePath: string,
  params: Record<string, string | undefined>,
  page: number,
  paramName: string,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key !== paramName && value) query.set(key, value);
  }
  // Página 1 não precisa aparecer na URL — mantém o endereço limpo.
  if (page > 1) query.set(paramName, String(page));
  const qs = query.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** Navegação entre páginas do servidor. Links de verdade (não botões com
 * estado), então a página atual fica no endereço: dá para compartilhar,
 * recarregar e voltar pelo botão do navegador sem perder o lugar. */
export function Pagination({
  total,
  page,
  pageSize,
  basePath,
  params,
  paramName = "page",
  rotulo,
}: Props) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-4 pt-3">
      <p className="text-sm text-muted-foreground tabular-nums">
        {first}–{last} de {total}
        {rotulo ? ` ${rotulo}` : ""}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<Link href={hrefFor(basePath, params, page - 1, paramName)} />}
          >
            <ChevronLeft className="size-4" />
            Anterior
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled>
            <ChevronLeft className="size-4" />
            Anterior
          </Button>
        )}
        <span className="text-sm text-muted-foreground tabular-nums">
          {page} / {lastPage}
        </span>
        {page < lastPage ? (
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<Link href={hrefFor(basePath, params, page + 1, paramName)} />}
          >
            Próxima
            <ChevronRight className="size-4" />
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled>
            Próxima
            <ChevronRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
