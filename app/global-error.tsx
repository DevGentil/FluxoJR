"use client";

/** Último recurso: erro no próprio layout raiz, onde nem o `error.tsx` do app
 * chega a montar. Precisa trazer as próprias tags <html>/<body>, porque o
 * layout que normalmente as fornece é justamente o que falhou — por isso
 * também não dá para usar os componentes de UI daqui. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "32rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>O FluxoJR não conseguiu iniciar</h1>
          <p style={{ color: "#666", marginBottom: "1.5rem", lineHeight: 1.5 }}>
            Houve uma falha antes da tela carregar. Recarregar costuma resolver.
            {error.digest && ` Código para suporte: ${error.digest}.`}
          </p>
          <button
            onClick={reset}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid #ccc",
              background: "#111",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Recarregar
          </button>
        </div>
      </body>
    </html>
  );
}
