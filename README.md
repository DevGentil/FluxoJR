# FluxoJR

Sistema de fluxo de caixa para holding — controle de contas bancárias, transações,
contas a pagar/receber, categorização por centro de custo e relatórios (DRE
simplificado), com projeção de saldo futuro.

Construído com uma única empresa em mente, mas com o modelo de dados já preparado
para suportar múltiplas empresas de uma holding no futuro.

## Stack

- [Next.js 16](https://nextjs.org) (App Router) + TypeScript
- [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com)
- [Prisma ORM](https://www.prisma.io) 7 + PostgreSQL
- [Supabase Auth](https://supabase.com/auth) para autenticação
- [Recharts](https://recharts.org) para os gráficos do dashboard

## Funcionalidades

- **Dashboard**: saldo consolidado, entradas x saídas por mês, projeção de saldo
  para 30/60/90 dias e próximos vencimentos.
- **Transações**: lançamentos manuais de entrada/saída, com filtros por período,
  conta, categoria e tipo. Importação de extratos via CSV/XLSX com mapeamento de
  colunas e preview antes de confirmar.
- **Contas a Pagar/Receber**: lançamentos previstos com vencimento, marcação de
  atraso automática e baixa (gera a transação correspondente automaticamente).
- **Categorias**: organização por tipo (entrada/saída) e centro de custo.
- **Contas Bancárias**: múltiplas contas com saldo calculado a partir do
  histórico de transações.
- **Relatórios**: DRE simplificado por categoria/centro de custo no período, com
  exportação em CSV.
- **Tema claro/escuro** com detecção automática da preferência do sistema.

## Rodando localmente

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Configure as variáveis de ambiente (copie `.env.example` para `.env` e
   preencha):

   ```bash
   cp .env.example .env
   ```

   - `DATABASE_URL`: connection string do PostgreSQL (local ou de um projeto
     [Supabase](https://supabase.com)).
   - `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`: encontrados em
     **Project Settings → API** no painel do Supabase. Sem essas variáveis, o
     app roda em modo aberto (sem exigir login) — útil para desenvolvimento
     local antes de configurar o Supabase.

3. Aplique as migrations e (opcionalmente) popule com dados de exemplo:

   ```bash
   npx prisma migrate deploy
   npm run db:seed
   ```

4. Suba o servidor de desenvolvimento:

   ```bash
   npm run dev
   ```

   Acesse [http://localhost:3000](http://localhost:3000).

## Deploy

O deploy recomendado é [Vercel](https://vercel.com) (app) + [Supabase](https://supabase.com)
(banco de dados e autenticação):

1. Crie um projeto no Supabase e rode `npx prisma migrate deploy` apontando
   para a connection string dele.
2. Crie o(s) usuário(s) de acesso em **Authentication → Users** no painel do
   Supabase.
3. Importe o repositório na Vercel e configure as mesmas variáveis de ambiente
   do `.env.example`.
