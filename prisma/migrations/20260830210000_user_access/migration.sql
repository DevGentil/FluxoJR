-- Contas de acesso e o papel de cada uma por unidade.
--
-- Ate aqui o sistema so perguntava SE havia um usuario logado, nunca QUEM
-- era: quem entrava trocava de unidade a vontade, via a remuneracao de todos
-- os medicos e podia excluir qualquer registro. Estas duas tabelas sao o que
-- permite responder "esta pessoa pode isso, nesta empresa".
--
-- A autenticacao continua no Supabase. `authId` e a ponte entre a sessao
-- dele e a permissao daqui.

CREATE TYPE "UserRole" AS ENUM ('OPERACIONAL', 'FINANCEIRO', 'GESTOR');

CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "authId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    -- Acesso irrestrito, presente e futuro. Mora na conta e nao numa linha
    -- por empresa: fosse linha, a unidade nova entraria invisivel para a
    -- diretoria ate alguem lembrar de cadastrar o acesso.
    "holding" BOOLEAN NOT NULL DEFAULT false,
    -- A senha foi definida por quem criou a conta, nao pelo dono dela.
    "senhaProvisoria" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppUser_authId_key" ON "AppUser"("authId");
CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");
CREATE INDEX "AppUser_createdById_idx" ON "AppUser"("createdById");

-- Quem criou a conta some do rastro em vez de arrastar a conta criada junto.
ALTER TABLE "AppUser"
  ADD CONSTRAINT "AppUser_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "UserAccess" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAccess_pkey" PRIMARY KEY ("id")
);

-- Uma conta tem no maximo um papel por empresa: dois papeis na mesma unidade
-- seria ambiguidade sem resposta ("qual vence?").
CREATE UNIQUE INDEX "UserAccess_userId_companyId_key" ON "UserAccess"("userId", "companyId");
CREATE INDEX "UserAccess_companyId_idx" ON "UserAccess"("companyId");

-- Cascade nos dois lados: apagada a conta ou a empresa, o acesso perde o
-- sentido. Nao ha historico a preservar aqui — o que aconteceu fica no log
-- de auditoria, nao na linha de permissao.
ALTER TABLE "UserAccess"
  ADD CONSTRAINT "UserAccess_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserAccess"
  ADD CONSTRAINT "UserAccess_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
