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
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn("relative inline-block", className)}>
      <Image
        src={showWordmark ? "/jr-holding-logo.png" : "/jr-holding-mark.png"}
        alt="JR Holding"
        fill
        sizes="(max-width: 1024px) 15vw, 20vw"
        className="object-contain"
        priority
      />
    </span>
  );
}
