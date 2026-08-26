import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Padrão é 1MB, pequeno demais para PDFs de contrato/documentos
    // enviados na tela de Empresas.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
