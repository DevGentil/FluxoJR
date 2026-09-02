"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getActiveCompanyId } from "@/lib/scope";
import { requireUser } from "@/lib/auth";
import { parseDateOnly, todayDateOnly } from "@/lib/date-only";
import { runMutation, type ActionState } from "@/lib/actions-utils";
import { lerAnexos } from "@/lib/anexos";
import { auditar } from "@/lib/audit";
import { formatCurrency } from "@/lib/format";

const scheduledSchema = z.object({
  type: z.enum(["PAYABLE", "RECEIVABLE"]),
  description: z.string().min(1, "Informe uma descrição"),
  amount: z.coerce.number().positive("O valor deve ser maior que zero"),
  dueDate: z.string().min(1),
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  supplierId: z.string().optional(),
});

function stripNone(raw: Record<string, FormDataEntryValue>) {
  const clean = { ...raw };
  for (const key of ["accountId", "categoryId", "supplierId"]) {
    if (clean[key] === "__none__") clean[key] = "";
  }
  return clean;
}

export async function createScheduledEntry(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = scheduledSchema.safeParse(stripNone(Object.fromEntries(formData)));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId("contas-a-pagar-receber");
    const { accountId, categoryId, supplierId, dueDate, ...rest } = parsed.data;

    // A nota costuma chegar junto com a conta a pagar; o comprovante vem
    // depois, na baixa. Por isso anexar é opcional aqui e existe de novo
    // no momento de marcar como pago.
    const anexos = await lerAnexos(formData, "anexos");

    await prisma.scheduledEntry.create({
      data: {
        ...rest,
        dueDate: parseDateOnly(dueDate),
        companyId,
        accountId: accountId || null,
        categoryId: categoryId || null,
        supplierId: supplierId || null,
        documents: { create: anexos.map((a) => ({ ...a, company: { connect: { id: companyId } } })) },
      },
    });

    revalidatePath("/contas-a-pagar-receber");
    revalidatePath("/dashboard");
  });
}

export async function updateScheduledEntry(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = scheduledSchema.safeParse(stripNone(Object.fromEntries(formData)));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId("contas-a-pagar-receber");
    const { accountId, categoryId, supplierId, dueDate, ...rest } = parsed.data;
    const { count } = await prisma.scheduledEntry.updateMany({
      where: { id, companyId },
      data: {
        ...rest,
        dueDate: parseDateOnly(dueDate),
        accountId: accountId || null,
        categoryId: categoryId || null,
        supplierId: supplierId || null,
      },
    });
    if (count === 0) throw new Error("Lançamento não encontrado.");

    // Acrescenta, não substitui — vale o mesmo raciocínio das transações.
    const anexos = await lerAnexos(formData, "anexos");
    if (anexos.length > 0) {
      await prisma.document.createMany({
        data: anexos.map((a) => ({ ...a, companyId, scheduledEntryId: id })),
      });
    }

    revalidatePath("/contas-a-pagar-receber");
    revalidatePath("/dashboard");
  });
}

/** Remove um anexo de uma conta a pagar/receber. O `companyId` no where
 * impede que um id de outra unidade apague anexo alheio. */
export async function removerAnexoAgendado(id: string): Promise<ActionState> {
  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId("contas-a-pagar-receber");
    const { count } = await prisma.document.deleteMany({
      where: { id, companyId, scheduledEntryId: { not: null } },
    });
    if (count === 0) throw new Error("Anexo não encontrado.");

    // Sem `revalidatePath`, pelo mesmo motivo da remoção em transações: o
    // refresh remontaria o diálogo aberto e o arquivo reapareceria depois
    // de apagado.
  });
}

export async function deleteScheduledEntry(id: string): Promise<ActionState> {
  return runMutation(async () => {
    await requireUser();
    const companyId = await getActiveCompanyId("contas-a-pagar-receber");
    const { count } = await prisma.scheduledEntry.deleteMany({
      where: { id, companyId },
    });
    if (count === 0) throw new Error("Lançamento não encontrado.");

    revalidatePath("/contas-a-pagar-receber");
    revalidatePath("/dashboard");
  });
}

const importRowSchema = z.object({
  dueDate: z.string().min(1),
  amount: z.number(),
  type: z.enum(["PAYABLE", "RECEIVABLE"]),
  description: z.string().min(1),
});

export async function importScheduledEntries(input: {
  fileName: string;
  accountId?: string;
  categoryId?: string;
  supplierId?: string;
  rows: { dueDate: string; amount: number; type: "PAYABLE" | "RECEIVABLE"; description: string }[];
}) {
  await requireUser();

  const parsedRows = z.array(importRowSchema).parse(input.rows);
  if (parsedRows.length === 0) return { imported: 0 };

  const companyId = await getActiveCompanyId("contas-a-pagar-receber");

  if (input.accountId) {
    const account = await prisma.account.findFirst({
      where: { id: input.accountId, companyId },
      select: { id: true },
    });
    if (!account) throw new Error("Conta inválida.");
  }

  await prisma.scheduledEntry.createMany({
    data: parsedRows.map((row) => ({
      type: row.type,
      description: row.description,
      amount: Math.abs(row.amount),
      dueDate: parseDateOnly(row.dueDate),
      companyId,
      accountId: input.accountId || null,
      categoryId: input.categoryId || null,
      supplierId: input.supplierId || null,
      status: "PENDING" as const,
    })),
  });

  revalidatePath("/contas-a-pagar-receber");
  revalidatePath("/dashboard");
  return { imported: parsedRows.length };
}

/** Dá baixa no lançamento, criando a transação correspondente.
 *
 * Recebe `FormData` porque é aqui que o comprovante de pagamento aparece
 * na vida real — quem acabou de pagar tem o PDF do banco na mão. Anexar
 * continua opcional: a baixa não pode ficar refém de ter o arquivo. */
export async function markAsPaid(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const accountId = String(formData.get("accountId") ?? "");
  if (!accountId) return { error: "Selecione a conta." };

  return runMutation(async () => {
    await requireUser();
    // "aprovar", e não "editar": dar baixa é o ato que move dinheiro de
    // verdade — vira transação e entra no resultado. Cadastrar a previsão
    // continua sendo "editar"; só o financeiro e a holding baixam.
    const companyId = await getActiveCompanyId("contas-a-pagar-receber", "aprovar");

    const [entry, account] = await Promise.all([
      prisma.scheduledEntry.findFirst({ where: { id, companyId } }),
      prisma.account.findFirst({ where: { id: accountId, companyId }, select: { id: true } }),
    ]);
    if (!entry) throw new Error("Lançamento não encontrado.");
    if (!account) throw new Error("Conta inválida.");
    if (entry.status === "PAID") throw new Error("Este lançamento já foi baixado.");

    // Lido ANTES de abrir a transação: ler arquivos de 10MB dentro dela
    // seguraria a conexão do banco durante a leitura à toa, e um anexo
    // recusado deve barrar a baixa antes de qualquer escrita.
    const anexos = await lerAnexos(formData, "anexos");

    await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          date: parseDateOnly(todayDateOnly()),
          amount: entry.amount,
          type: entry.type === "RECEIVABLE" ? "INCOME" : "EXPENSE",
          description: entry.description,
          companyId,
          accountId,
          categoryId: entry.categoryId,
          supplierId: entry.supplierId,
          source: "SCHEDULED",
        },
      });

      await tx.scheduledEntry.update({
        where: { id },
        data: {
          status: "PAID",
          paidDate: parseDateOnly(todayDateOnly()),
          transactionId: transaction.id,
          accountId,
        },
      });

      // O comprovante fica no lançamento, e não na transação criada: é na
      // tela de contas a pagar que a pessoa vai procurá-lo, ao lado da
      // nota que já estava lá desde que a conta foi cadastrada.
      if (anexos.length > 0) {
        await tx.document.createMany({
          data: anexos.map((a) => ({ ...a, companyId, scheduledEntryId: id })),
        });
      }
    });

    // A baixa vira transação, e transação alimenta relatório e balanço. Sem
    // revalidar os cinco, o número mudava no banco e a tela continuava
    // mostrando o antigo até alguém recarregar na mão.
    revalidatePath("/contas-a-pagar-receber");
    revalidatePath("/transacoes");
    revalidatePath("/dashboard");
    revalidatePath("/relatorios");
    revalidatePath("/balanco");

    await auditar({
      companyId,
      module: "contas-a-pagar-receber",
      acao: "pagou",
      entidade: entry.description,
      resumo:
        (entry.type === "RECEIVABLE" ? "recebimento de " : "pagamento de ") +
        formatCurrency(Number(entry.amount)) +
        " baixado",
      registroId: id,
    });
  });
}
