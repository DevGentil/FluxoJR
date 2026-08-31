import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Marca oficial da JR Holding (brasão + "JR" + seta ascendente e o wordmark
 * "HOLDING"), a partir da arte original em PDF fornecida pela empresa.
 * `showWordmark=false` usa o recorte só do brasão, sem o texto — para
 * espaços compactos (ex: header mobile).
 */
export function JRHoldingMark({
  className,
  showWordmark = true,
  sizes = "96px",
}: {
  className?: string;
  showWordmark?: boolean;
  /**
   * Largura com que a marca é REALMENTE desenhada, em px — é o que o
   * navegador usa para escolher a variante no `srcset`.
   *
   * Tem que vir de quem chama, porque o tamanho é ditado pelo `className`
   * e os dois usos diferem em 4×: 96px no login, 24px na sidebar. Enquanto
   * isso era um valor único em `vw`, a sidebar baixava a variante de 256px
   * para desenhar 24 — 11× mais pixels do que cabiam na tela.
   *
   * Em px e não em `vw` porque nenhum dos dois usos é proporcional à
   * viewport: ambos têm tamanho fixo no CSS.
   */
  sizes?: string;
}) {
  return (
    <span className={cn("relative inline-block", className)}>
      <Image
        src={showWordmark ? "/jr-holding-logo.png" : "/jr-holding-mark.png"}
        alt="JR Holding"
        fill
        sizes={sizes}
        className="object-contain"
        priority
      />
    </span>
  );
}
