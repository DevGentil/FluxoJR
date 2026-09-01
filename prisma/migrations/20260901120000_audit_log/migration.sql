-- Registro de quem alterou o que.
--
-- Nenhuma das 18 tabelas guardava autor de alteracao. Se um valor de contrato
-- mudasse de R$ 45 para R$ 25, ou um mes inteiro fosse marcado como pago, nao
-- havia rastro — nem de quem, nem de quando.
--
-- Ficou mais necessario depois da decisao de que o papel Operacional edita o
-- contrato do medico por inteiro, valores inclusive: quem lanca o dia tambem
-- pode mudar quanto aquele dia vale.
--
-- `userName`, `userEmail` e `companyName` sao COPIAS e nao chaves
-- estrangeiras: um registro que perde o sujeito quando a conta e removida
-- deixa de ser auditoria.

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    -- Nulos quando o evento e do sistema e nao de uma unidade (criar conta
    -- de holding, por exemplo). Melhor nulo do que uma empresa inventada.
    "companyId" TEXT,
    "companyName" TEXT,
    "module" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "resumo" TEXT NOT NULL,
    "registroId" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");
CREATE INDEX "AuditLog_companyId_at_idx" ON "AuditLog"("companyId", "at");
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
