import { GRAVIDADE_ROTULO, type Gravidade } from "@/lib/erro-gravidade";

/** Cores das três gravidades.
 *
 * Vermelho, âmbar e cinza: a escala já é entendida sem legenda, e o cinza
 * do aviso o empurra para o fundo em vez de competir com o que importa.
 * O texto acompanha a cor porque cor sozinha não serve a quem não a
 * distingue. */
const ESTILO: Record<Gravidade, string> = {
  CRITICO: "bg-red-500/12 text-red-600 dark:text-red-400",
  ERRO: "bg-amber-500/12 text-amber-700 dark:text-amber-400",
  AVISO: "bg-muted text-muted-foreground",
};

export function SeloGravidade({ gravidade }: { gravidade: Gravidade }) {
  return (
    <span
      className={`inline-block w-16 shrink-0 rounded px-1.5 py-0.5 text-center text-[10px] font-medium tracking-wide uppercase ${ESTILO[gravidade]}`}
    >
      {GRAVIDADE_ROTULO[gravidade]}
    </span>
  );
}
