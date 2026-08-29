# FluxoJR

Sistema financeiro de uma holding de clínicas: fluxo de caixa das unidades e o
repasse dos médicos que atendem nelas.

Suporta várias empresas organizadas por marca/grupo, com visão consolidada —
veja [Múltiplas empresas e escopo](#múltiplas-empresas-e-escopo).

## Stack

- [Next.js 16](https://nextjs.org) (App Router) + TypeScript
- [Tailwind CSS](https://tailwindcss.com) + [Base UI](https://base-ui.com) (shadcn)
- [Prisma ORM](https://www.prisma.io) 7 + PostgreSQL
- [Supabase Auth](https://supabase.com/auth) para autenticação
- [Recharts](https://recharts.org) para os gráficos
- [Vitest](https://vitest.dev) — 269 testes

## O que o sistema faz

O menu lateral é organizado por pergunta, não por ordem de cadastro:

### Movimento — o dinheiro entrando e saindo

- **Transações** — lançamentos de entrada e saída, com filtro por período,
  conta, categoria, fornecedor e tipo. Importação de extrato em CSV/XLSX com
  mapeamento de colunas e prévia antes de confirmar. Paginado, com exportação
  do filtro inteiro em CSV.
- **A Pagar/Receber** — lançamentos previstos com vencimento, marcação de
  atraso e baixa (que gera a transação correspondente).
- **Fechamento de Caixa** — conferência diária do caixa, com sangrias e
  pagamentos.

### Repasses médicos — quanto se paga a quem atende

Modelado a partir das planilhas reais da unidade de Contagem. Ver
[Regras de negócio](#regras-de-negócio-do-repasse).

- **Lançamentos** — um lançamento por dia de atendimento, como nas planilhas.
  Em três níveis: mês → dia → os lançamentos daquele dia. Aceita o valor total
  do dia (o formato de 98% dos lançamentos reais) ou o detalhe por item, que
  o sistema soma pelo contrato.
- **Médicos** — cadastro e contrato de cada um, com filtro, ordenação por
  coluna e paginação. A ficha individual traz o contrato item a item com a
  data de vigência e o histórico de reajustes, o repasse mês a mês e todos os
  lançamentos — cada tabela com sua própria ordem —, além dos arquivos do
  médico (contrato assinado, aditivos).
- **Operação** — o catálogo de procedimentos com preço, encargos e custo de
  insumo, quanto sobra para pagar o médico, e as métricas de rentabilidade
  (receita, lucro, margem, conversão de consulta em exame). Ordenável por
  qualquer coluna, dentro de cada grupo e de cada período.

### Análise

- **Relatórios** — DRE simplificado por categoria, fornecedor e centro de
  custo, ordenável por qualquer coluna e com exportação em CSV na mesma ordem
  da tela, mais o arquivo do DRE fechado pelo contador.
- **Balanço Executivo** — faturamento, despesas e fluxo líquido do período,
  saldo inicial x final por conta e por empresa, ranking de categorias, e um
  comparativo mensal / trimestral / semestral / anual com a variação contra o
  período anterior.

### Cadastros

Categorias (com centro de custo), Fornecedores, Contas Bancárias e Empresas
(com os documentos societários).

## Múltiplas empresas e escopo

Dois níveis: **Grupo** (a marca, ex: "AmorSaude") e **Empresa** (a unidade, ex:
"AS Contagem"), com `Company.groupId` opcional. O escopo ativo é escolhido no
seletor do topo do menu e vale para toda a navegação (guardado em cookie, sem
sujar a URL):

- **Uma empresa** — as telas de lançamento exigem esse escopo.
- **Um grupo** ou **a holding inteira** — soma as unidades. Todas as telas
  analíticas têm uma visão consolidada própria, que compara unidades em vez de
  listar registros.

Toda consulta é filtrada por `companyId`, e as server actions revalidam o
escopo do lado do servidor — o cookie não é autoridade sobre o que pode ser
lido ou escrito.

## Regras de negócio do repasse

Estas foram extraídas de planilhas reais e são o coração do sistema. Cada uma
vive num módulo puro e testado em `lib/`, com os números das planilhas nos
testes.

**Data de calendário é sempre meia-noite UTC** (`lib/date-only.ts`). Não é
detalhe: em UTC-3, a meia-noite UTC do dia 1º é 21h do dia 31 no relógio local,
então ler o mês de um lançamento com `getMonth()` jogava todo dia 1º no mês
anterior. Para gravar e comparar, UTC; para exibir, `timeZone: "UTC"`. O
relógio local só responde "que dia é hoje para quem está olhando".

**O contrato tem vigência** (`lib/doctor-rates.ts`). O valor combinado com um
médico não é um número, é uma sequência de valores, cada um valendo a partir de
uma data — as planilhas trazem 13 reajustes reais. Lançar um dia de maio depois
de um reajuste de junho congela o valor de MAIO. Quando a data pedida é anterior
a tudo que se conhece, cai na versão mais antiga.

**A taxa é congelada no lançamento.** Cada linha guarda sua própria cópia do
valor; mudar o contrato depois não reescreve o que já foi lançado.

**Margem só compara o que é comparável** (`lib/service-margin.ts`,
`lib/doctor-period.ts`). Item sem preço — plantão, auxílio — fica de fora dos
dois lados da conta. A primeira versão filtrava só a receita e mostrava −209%
numa unidade que estava em −10,4%.

**Lançamento sem detalhe conta no custo, não nas contagens.** Quando só o valor
do dia é informado, não há como saber o que foi feito nem a que preço foi
cobrado — então ele entra no repasse e fica fora da conversão e da margem, e a
tela diz isso em vez de mostrar zero como se fosse apurado.

**Encargos são um percentual por faixa de valor** (`TaxBracket`), editável por
empresa. Apesar do nome do modelo, o percentual engloba taxa de maquininha,
impostos e demais custos proporcionais ao faturamento — nas telas ele aparece
como "encargos".

## Ordenação das tabelas

Clicar no cabeçalho ordena (`lib/sorting.ts`, `components/sortable-head.tsx`).
Três decisões que valem explicação:

**Tabela que pagina no servidor guarda a ordem na URL**, não em `useState`.
Ordenar no cliente reordenaria só as 20 linhas abertas, e "o maior valor"
seria o maior daquela página — um número errado com cara de certo. Com a
ordem no endereço quem ordena é a consulta, a página volta ao começo, e a
escolha sobrevive ao recarregar. Tabela sem paginação de servidor usa
`LocalSortableHead`, com a ordem em `useState`.

**A lista de colunas permitidas é obrigatória.** O campo chega da barra de
endereço; sem a lista daria para pedir ordem por uma coluna que a tela não
mostra. Fora dela, cai no padrão em vez de errar.

**Valor ausente vai para o fim nas duas direções.** Unidade sem receita não
tem "a pior margem", tem "não dá para calcular" — tratá-la como o menor
número a jogaria para o topo do decrescente invertido e esconderia quem está
de fato no vermelho. Pelo mesmo motivo, coluna de percentual ordena pela
razão, não pelo texto formatado: "9,0%" viria depois de "12,3%".

## Organização do código

```
app/(app)/<rota>/     page.tsx + seus componentes e server actions
lib/                  regra de negócio pura e infraestrutura
components/           o que é compartilhado entre rotas
components/ui/        shadcn/Base UI, pouco tocado
prisma/               schema e migrations
scripts/              ferramentas de linha de comando
```

Duas convenções valem a pena conhecer:

**Regra de negócio mora em `lib/`, sem banco.** `date-only`, `doctor-rates`,
`doctor-period`, `service-margin`, `periods` e `format` não importam Prisma.
Isso os torna testáveis sem banco e — na prática — evita um erro real: um
Client Component que importe um módulo que puxe `lib/prisma` leva o driver do
Postgres para o bundle do navegador. O `tsc` não pega; só o `build` reclama.

**Server actions seguem dois formatos.** Formulário nativo usa
`parseForm`/`runMutation` com `useActionState`; payload estruturado usa uma
função async que devolve `{ error?: string }`. Toda action chama
`requireUser()` e resolve o `companyId` do escopo ativo.

## Rodando localmente

```bash
npm install
cp .env.example .env      # preencha DATABASE_URL e as chaves do Supabase
npx prisma migrate deploy
npm run dev
```

Sem `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`, o app roda em
modo aberto (sem login) — útil no desenvolvimento local.

## Testes

```bash
npm run test        # roda uma vez
npm run test:watch  # modo watch
```

- **Unitários** (`lib/*.test.ts`) — funções puras, sem banco.
- **Integração** (`app/**/*actions.test.ts`, `lib/cashflow.test.ts`,
  `lib/balance-report.test.ts`) — exercitam as server actions contra um
  PostgreSQL de teste real.

Os testes de integração precisam de um banco **separado do de
desenvolvimento** (o nome tem que conter "test", como proteção — os dados são
apagados a cada teste):

```bash
cp .env.test.example .env.test
createdb fluxojr_test
```

## Importando os repasses de planilha

`scripts/import-repasses.ts` traz médicos, contratos e lançamentos das
planilhas consolidadas. Roda em **simulação por padrão** — mostra o que faria
sem gravar nada:

```bash
npx tsx --env-file=.env scripts/import-repasses.ts --empresa "AS Contagem"
npx tsx --env-file=.env scripts/import-repasses.ts --empresa "AS Contagem" --confirmar
```

`--desde YYYY-MM-DD` corta lançamentos anteriores, `--apagar-demo` limpa os
dados de demonstração da empresa antes, `--detalhar` lista os itens de catálogo
que seriam criados. Tudo numa transação única: ou entra inteiro, ou não entra.

## Deploy

[Vercel](https://vercel.com) (app) + [Supabase](https://supabase.com) (banco e
autenticação):

1. Rode `npx prisma migrate deploy` apontando para a connection string do
   Supabase.
2. Crie os usuários em **Authentication → Users** no painel.
3. Importe o repositório na Vercel com as mesmas variáveis do `.env.example`.

> O projeto está pinado em `next@16.2.12`. A 16.3.x tinha um bug no dev server
> (Turbopack) que fazia a página nunca hidratar — nenhum botão respondia e nada
> aparecia no console. Se ao atualizar isso voltar, `npm run build && npm run
> start` funcionando confirma que é o mesmo bug.
