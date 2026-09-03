import "../documento-impresso.css";

/** Layout do DRE e do Balanço Executivo impressos.
 *
 * Igual ao do demonstrativo de repasse e pelo mesmo motivo: não herdar o
 * layout do sistema. Aqui não há menu, seletor de escopo nem tema escuro — o
 * documento é sempre claro, porque vira papel e PDF, e um PDF de fundo preto
 * gasta a tinta de quem imprime e cansa quem lê. */
export default function DocumentoLayout({ children }: { children: React.ReactNode }) {
  return <div className="documento">{children}</div>;
}
