import { ThemeToggle } from "@/components/theme-toggle";
import { JRHoldingMark } from "@/components/jr-holding-logo";

/** A moldura das telas de fora do sistema — login, primeiro acesso e
 * recuperação de senha. Mantém a marca, o brilho e o cartão iguais nas
 * quatro, para quem está no meio do fluxo não sentir que trocou de site. */
export function TelaAutenticacao({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-16">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 45% at 50% 28%, color-mix(in oklch, #c9a24b 16%, transparent) 0%, transparent 70%)",
        }}
      />

      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="relative flex w-full max-w-sm flex-col items-center">
        <JRHoldingMark
          className="h-24 w-24 drop-shadow-[0_0_24px_rgba(201,162,75,0.18)]"
          sizes="96px"
        />
        <div className="mt-8 w-full rounded-2xl bg-card p-6 ring-1 ring-foreground/10 sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
