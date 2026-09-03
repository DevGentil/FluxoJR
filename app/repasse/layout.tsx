import type { Metadata } from "next";
import "../documento-impresso.css";

export const metadata: Metadata = {
  title: "Demonstrativo de Repasse",
};

/** Layout do documento impresso.
 *
 * Existe para NÃO herdar o do sistema: aqui não há menu, escopo nem tema
 * escuro. O documento é sempre claro, porque ele vira papel e PDF — e um PDF
 * de fundo preto gasta tinta de quem imprime e fica ilegível de quem lê. */
export default function RepasseLayout({ children }: { children: React.ReactNode }) {
  return <div className="documento">{children}</div>;
}
