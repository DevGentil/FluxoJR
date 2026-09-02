"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Banknote,
  CalendarCheck,
  FolderTree,
  Loader2,
  Receipt,
  Search,
  Stethoscope,
  Tags,
  Truck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setActiveScope } from "@/app/(app)/scope-actions";
import type { ItemBusca, RespostaBusca, TipoBusca } from "@/lib/busca-global";

/** Um ícone por tipo de resultado.
 *
 * O mapa vive aqui, e não junto das fontes no servidor, porque componente
 * não atravessa a fronteira servidor/cliente como dado. O servidor manda o
 * tipo; a tela decide como ele se parece. */
const ICONES: Record<TipoBusca, LucideIcon> = {
  transacao: Receipt,
  "conta-prevista": CalendarCheck,
  fornecedor: Truck,
  categoria: Tags,
  medico: Stethoscope,
  fechamento: Banknote,
  "conta-bancaria": Banknote,
  servico: FolderTree,
};

/** Pausa antes de perguntar ao servidor.
 *
 * Duzentos milissegundos é o intervalo entre teclas de quem digita rápido:
 * abaixo disso a busca dispara uma consulta por letra e as respostas chegam
 * fora de ordem; acima, a lista parece travada. */
const ESPERA_MS = 200;


const VAZIO: RespostaBusca = { termo: "", grupos: [], total: 0, fora: [] };

/** Pergunta ao servidor. Falha de rede vira resposta vazia daquele termo, e
 * nao promessa pendente para sempre: sem isto, um erro deixaria o giro do
 * carregamento rodando sem fim, que e a pior das respostas possiveis — a
 * que nao diz nada e nao termina. */
async function perguntar(termo: string, signal?: AbortSignal): Promise<RespostaBusca> {
  try {
    const r = await fetch("/api/busca", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ termo }),
      signal,
    });
    if (!r.ok) return { ...VAZIO, termo };
    return (await r.json()) as RespostaBusca;
  } catch {
    return { ...VAZIO, termo };
  }
}

/** Busca que atravessa as telas, aberta por Ctrl+K.
 *
 * A tela é uma lista só, achatada, mesmo desenhada em grupos: é isso que
 * permite subir e descer com o teclado atravessando de Transações para
 * Fornecedores sem a pessoa precisar saber que mudou de seção. */
export function BuscaGlobal() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const [resposta, setResposta] = useState<RespostaBusca>(VAZIO);
  const [selecionado, setSelecionado] = useState(0);
  const [trocandoEscopo, iniciarTrocaDeEscopo] = useTransition();
  /** A unidade mudou por dentro do dialogo. A tela atras ainda mostra a
   * anterior, e so precisa se acertar se a pessoa sair sem escolher nada —
   * escolher ja navega, e navegar ja pega o escopo novo. */
  const [escopoTrocado, setEscopoTrocado] = useState(false);

  const listaRef = useRef<HTMLDivElement>(null);
  /** Só a resposta da última pergunta vale. Sem este contador, uma consulta
   * lenta de duas letras chega depois da rápida de cinco e sobrescreve a
   * lista certa pela antiga. */
  const pergunta = useRef(0);
  const idLista = useId();

  const termoLimpo = termo.trim();
  const curto = termoLimpo.length > 0 && termoLimpo.length < 2;

  /** A resposta so vale para o termo que a produziu. Guardar isso no
   * proprio dado, em vez de num `carregando` a parte, faz o estado nao ter
   * como divergir: nao existe combinacao possivel de "carregado" com a
   * lista de outra pergunta. */
  const respondida = resposta.termo === termoLimpo;
  const carregando = termoLimpo.length >= 2 && !respondida;
  // Enquanto a proxima resposta nao chega, a anterior continua na tela: a
  // lista piscando para vazia a cada tecla e mais desorientador do que uma
  // lista levemente atrasada com o giro do carregamento ao lado.
  const visivel = termoLimpo.length < 2 ? VAZIO : resposta;

  const itens = useMemo(() => visivel.grupos.flatMap((g) => g.itens), [visivel]);

  /** Onde cada grupo comeca dentro da lista achatada. A selecao anda por um
   * indice unico atravessando as secoes, e desenhar a tela e traduzir esse
   * indice de volta para (grupo, posicao) — nao contar linhas enquanto
   * renderiza. */
  const inicioDoGrupo = useMemo(() => {
    const inicios: number[] = [];
    let acumulado = 0;
    for (const grupo of visivel.grupos) {
      inicios.push(acumulado);
      acumulado += grupo.itens.length;
    }
    return inicios;
  }, [visivel]);

  // Ctrl+K / Cmd+K de qualquer lugar do sistema.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setAberto((a) => !a);
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  // A consulta em si, depois da pausa na digitação.
  useEffect(() => {
    if (!aberto || termoLimpo.length < 2 || respondida) return;
    const controle = new AbortController();
    const minha = ++pergunta.current;
    const relogio = setTimeout(async () => {
      const r = await perguntar(termoLimpo, controle.signal);
      // Chegou depois de a pessoa ter continuado a digitar: descarta.
      if (pergunta.current !== minha) return;
      setResposta(r);
      setSelecionado(0);
    }, ESPERA_MS);
    return () => {
      clearTimeout(relogio);
      controle.abort();
    };
  }, [termoLimpo, aberto, respondida]);

  // Mantém a linha escolhida visível quando a navegação é por teclado.
  useEffect(() => {
    listaRef.current
      ?.querySelector(`[data-indice="${selecionado}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selecionado]);

  const abrir = useCallback(
    (item: ItemBusca) => {
      setEscopoTrocado(false);
      setAberto(false);
      router.push(item.href);
    },
    [router]
  );

  function aoAbrirOuFechar(proximo: boolean) {
    setAberto(proximo);
    if (!proximo && escopoTrocado) {
      setEscopoTrocado(false);
      router.refresh();
    }
  }

  /** Leva o escopo para a unidade onde o termo existe e refaz a busca ali
   * mesmo. Sem `router.refresh()` aqui de proposito: ele remontaria o
   * layout, e com ele este dialogo — quem clicou continuaria querendo
   * buscar, e teria que digitar de novo o que acabou de digitar. */
  function irPara(companyId: string) {
    iniciarTrocaDeEscopo(async () => {
      await setActiveScope(`company:${companyId}`);
      setEscopoTrocado(true);
      const r = await perguntar(termoLimpo);
      setResposta(r);
      setSelecionado(0);
    });
  }

  function aoTeclarNoCampo(e: React.KeyboardEvent<HTMLInputElement>) {
    if (itens.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelecionado((i) => (i + 1) % itens.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelecionado((i) => (i - 1 + itens.length) % itens.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = itens[selecionado];
      if (item) abrir(item);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setAberto(true)}
        className="text-muted-foreground gap-2 font-normal"
        // O botão diz o que faz para quem usa mouse; o atalho, escondido em
        // tela estreita, é para quem já sabe onde ele está.
        title="Buscar em todo o sistema (Ctrl+K)"
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">Buscar...</span>
        <kbd className="bg-muted hidden rounded border px-1 text-[10px] font-medium md:inline">
          Ctrl K
        </kbd>
      </Button>

      <Dialog open={aberto} onOpenChange={aoAbrirOuFechar}>
        <DialogContent
          showCloseButton={false}
          // Alto na tela e largo: uma paleta de comandos, não uma caixa de
          // confirmação. Centralizada verticalmente, a lista cresceria para
          // os dois lados e mexeria o campo enquanto a pessoa digita.
          className="top-[10%] max-h-[70vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
        >
          <DialogTitle className="sr-only">Buscar em todo o sistema</DialogTitle>

          <div className="flex items-center gap-2 border-b px-3">
            {carregando ? (
              <Loader2 className="text-muted-foreground size-4 shrink-0 animate-spin" />
            ) : (
              <Search className="text-muted-foreground size-4 shrink-0" />
            )}
            <input
              autoFocus
              // O termo anterior fica ao reabrir — quem volta costuma
              // querer o mesmo resultado. Mas ja selecionado: senao a
              // busca seguinte sai grudada na anterior, e a pessoa procura
              // por "Altinomanutencao" sem ter pedido isso.
              onFocus={(e) => e.currentTarget.select()}
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              onKeyDown={aoTeclarNoCampo}
              placeholder="Buscar transação, fornecedor, médico, conta..."
              className="placeholder:text-muted-foreground h-12 w-full bg-transparent text-sm outline-none"
              role="combobox"
              aria-expanded={itens.length > 0}
              aria-controls={idLista}
              aria-autocomplete="list"
              aria-activedescendant={itens.length > 0 ? `${idLista}-${selecionado}` : undefined}
            />
          </div>

          <div ref={listaRef} id={idLista} role="listbox" aria-label="Resultados" className="overflow-y-auto p-1">
            {visivel.grupos.map((grupo, posicaoDoGrupo) => (
              <div key={grupo.tipo} className="mb-1">
                <p className="text-muted-foreground px-2 pt-2 pb-1 text-[11px] font-medium tracking-wide uppercase">
                  {grupo.rotulo}
                </p>
                {grupo.itens.map((item, posicaoNoGrupo) => {
                  const meu = inicioDoGrupo[posicaoDoGrupo] + posicaoNoGrupo;
                  const Icone = ICONES[item.tipo];
                  const ativo = meu === selecionado;
                  return (
                    <button
                      key={`${item.tipo}-${item.id}`}
                      id={`${idLista}-${meu}`}
                      data-indice={meu}
                      role="option"
                      aria-selected={ativo}
                      type="button"
                      onClick={() => abrir(item)}
                      onMouseMove={() => setSelecionado(meu)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left",
                        ativo && "bg-accent text-accent-foreground"
                      )}
                    >
                      <Icone className="text-muted-foreground size-4 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{item.titulo}</span>
                        {(item.descricao || item.empresa) && (
                          <span className="text-muted-foreground block truncate text-xs">
                            {[item.descricao, item.empresa].filter(Boolean).join(" — ")}
                          </span>
                        )}
                      </span>
                      {item.detalhe && (
                        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                          {item.detalhe}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}

            {/* Existe, mas não onde a pessoa está olhando. Dizer isso é o que
                separa a busca de ajudar da busca de enganar. */}
            {visivel.fora.length > 0 && (
              <div className="p-2">
                <p className="text-muted-foreground mb-2 text-sm">
                  Nada em vista com “{visivel.termo}”, mas há resultados em outra unidade:
                </p>
                <div className="flex flex-wrap gap-2">
                  {visivel.fora.map((f) => (
                    <Button
                      key={f.companyId}
                      variant="outline"
                      size="sm"
                      disabled={trocandoEscopo}
                      onClick={() => irPara(f.companyId)}
                    >
                      {f.empresa}
                      <span className="text-muted-foreground tabular-nums">({f.quantos})</span>
                      <ArrowRight className="size-3.5" />
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {termoLimpo.length === 0 && (
              <p className="text-muted-foreground px-3 py-8 text-center text-sm">
                Digite para procurar em transações, contas, fornecedores, categorias, médicos,
                fechamentos e catálogo — de uma vez.
              </p>
            )}
            {curto && (
              <p className="text-muted-foreground px-3 py-8 text-center text-sm">
                Escreva pelo menos duas letras.
              </p>
            )}
            {termoLimpo.length >= 2 && !carregando && itens.length === 0 && visivel.fora.length === 0 && (
              <p className="text-muted-foreground px-3 py-8 text-center text-sm">
                Nada encontrado para “{termoLimpo}”.
              </p>
            )}
          </div>

          <div className="text-muted-foreground flex items-center justify-between border-t px-3 py-2 text-[11px]">
            <span aria-live="polite">
              {itens.length > 0
                ? `${itens.length} resultado${itens.length > 1 ? "s" : ""}`
                : "Busca em todo o sistema"}
            </span>
            <span className="hidden gap-3 sm:flex">
              <span>↑↓ navegar</span>
              <span>↵ abrir</span>
              <span>esc fechar</span>
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
