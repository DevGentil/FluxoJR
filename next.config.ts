import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O selo do Next no canto inferior esquerdo cobria o botao "Sair" da
  // sidebar. Desligar nao esconde problema: erro de compilacao e de execucao
  // continuam aparecendo na tela e no terminal — o selo so informa se a rota
  // e estatica ou dinamica, que aqui e sempre dinamica.
  devIndicators: false,

  experimental: {
    // Padrão é 1MB, pequeno demais para PDFs de contrato/documentos
    // enviados na tela de Empresas.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
