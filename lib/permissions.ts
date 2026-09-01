/** Quem pode ver e fazer o quê, por módulo.
 *
 * Módulo puro, sem Prisma e sem Supabase: a regra é uma tabela e três
 * funções, testáveis sem banco. Quem lê do banco é `lib/access.ts`; aqui só
 * se decide.
 *
 * A granularidade é MÓDULO × NÍVEL, e não uma permissão por operação. Foi
 * escolha deliberada: "a recepção lança, o financeiro aprova" é como a
 * operação descreve o próprio trabalho, e uma matriz de duzentos
 * interruptores por tabela ninguém mantém — nem consegue auditar de bater o
 * olho, que é metade do valor de ter regra escrita. */

export const MODULES = [
  "dashboard",
  "transacoes",
  "contas-a-pagar-receber",
  "fechamento-caixa",
  "repasses-medicos",
  "medicos",
  "operacao",
  "relatorios",
  "balanco",
  "categorias",
  "fornecedores",
  "contas-bancarias",
  "empresas",
  "contas",
  "auditoria",
  "erros",
] as const;

export type Module = (typeof MODULES)[number];

/** Como o módulo se chama na tela — para mensagem de erro e para o menu. */
export const MODULE_LABELS: Record<Module, string> = {
  dashboard: "Dashboard",
  transacoes: "Transações",
  "contas-a-pagar-receber": "A Pagar/Receber",
  "fechamento-caixa": "Fechamento de Caixa",
  "repasses-medicos": "Lançamentos",
  medicos: "Médicos",
  operacao: "Operação",
  relatorios: "Relatórios",
  balanco: "Balanço",
  categorias: "Categorias",
  fornecedores: "Fornecedores",
  "contas-bancarias": "Contas Bancárias",
  empresas: "Empresas",
  contas: "Contas de Acesso",
  auditoria: "Auditoria",
  erros: "Erros do Sistema",
};

/** Os quatro níveis são cumulativos: quem aprova também edita, quem edita
 * também vê. A ordem do array É a hierarquia — `nivelAtinge` compara por
 * índice, então inserir um nível novo no meio muda o significado de todos os
 * que vêm depois. */
export const LEVELS = ["nenhum", "ver", "editar", "aprovar"] as const;
export type Level = (typeof LEVELS)[number];

export const ROLES = ["OPERACIONAL", "FINANCEIRO", "GESTOR"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  OPERACIONAL: "Operacional",
  FINANCEIRO: "Financeiro",
  GESTOR: "Gestor",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OPERACIONAL: "Fechamento de caixa, lançamento de repasse e cadastro dos médicos da unidade.",
  FINANCEIRO: "Tudo do Operacional, mais transações, contas, cadastros, Balanço, e o aval do repasse.",
  GESTOR: "Acesso completo à unidade, incluindo a rentabilidade em Operação e a gestão de contas.",
};

/** A matriz, uma linha por papel.
 *
 * Definida com a operação em 30/08/2026. Dois pontos que foram decididos
 * explicitamente e não são óbvios ao ler:
 *
 * - **Financeiro vê Balanço mas não Operação.** É a única diferença entre
 *   Financeiro e Gestor: o resultado da unidade é do financeiro, a
 *   rentabilidade por procedimento é do gestor.
 * - **Operacional edita Médicos por inteiro, valor de contrato incluído.**
 *   Quem lança o dia também pode mudar quanto aquele dia vale. Foi decisão
 *   consciente, em nome da agilidade — e é justamente por isso que o registro
 *   de alterações deixa de ser desejável e passa a ser necessário. */
const MATRIX: Record<Role, Record<Module, Level>> = {
  OPERACIONAL: {
    dashboard: "ver",
    "fechamento-caixa": "editar",
    "repasses-medicos": "editar",
    medicos: "editar",
    transacoes: "nenhum",
    "contas-a-pagar-receber": "nenhum",
    relatorios: "nenhum",
    balanco: "nenhum",
    operacao: "nenhum",
    categorias: "nenhum",
    fornecedores: "nenhum",
    "contas-bancarias": "nenhum",
    empresas: "nenhum",
    contas: "nenhum",
    auditoria: "nenhum",
    erros: "nenhum",
  },
  FINANCEIRO: {
    dashboard: "ver",
    "fechamento-caixa": "editar",
    "repasses-medicos": "aprovar",
    medicos: "editar",
    transacoes: "editar",
    "contas-a-pagar-receber": "editar",
    // "editar" e nao "ver": o arquivo do DRE fechado pelo contador chega ao
    // financeiro, e e ele quem sobe.
    relatorios: "editar",
    balanco: "ver",
    operacao: "nenhum",
    categorias: "editar",
    fornecedores: "editar",
    "contas-bancarias": "editar",
    empresas: "editar",
    contas: "nenhum",
    auditoria: "nenhum",
    erros: "nenhum",
  },
  GESTOR: {
    dashboard: "ver",
    "fechamento-caixa": "editar",
    "repasses-medicos": "aprovar",
    medicos: "editar",
    transacoes: "editar",
    "contas-a-pagar-receber": "editar",
    relatorios: "editar",
    balanco: "ver",
    operacao: "editar",
    categorias: "editar",
    fornecedores: "editar",
    "contas-bancarias": "editar",
    empresas: "editar",
    // Gestor cria e edita contas da unidade dele. Nunca conta de holding —
    // essa regra nao cabe na matriz (que e por modulo) e mora na action.
    contas: "editar",
    // Quem responde pela unidade precisa saber quem mexeu no que dentro dela.
    auditoria: "ver",
    // Erro de sistema e assunto de quem mantem o sistema, nao de quem opera
    // a unidade. Fica so para a holding, que passa pela regra de ausencia
    // de restricao.
    erros: "nenhum",
  },
};

/** O que a conta pode fazer NUMA empresa.
 *
 * `holding` mora na conta e não numa linha por empresa de propósito: fosse
 * uma linha, a unidade nova entraria invisível para a diretoria até alguém
 * lembrar de cadastrar o acesso. Como marca da conta, empresa nova já nasce
 * coberta.
 *
 * `role` nulo significa "esta conta não tem acesso a esta empresa" — não é o
 * mesmo que ter um papel sem permissões. */
export interface Access {
  holding: boolean;
  role: Role | null;
}

export function nivelAtinge(nivel: Level, minimo: Level): boolean {
  return LEVELS.indexOf(nivel) >= LEVELS.indexOf(minimo);
}

/** O nível desta conta neste módulo, nesta empresa. */
export function levelFor(access: Access, module: Module): Level {
  if (access.holding) return "aprovar";
  if (!access.role) return "nenhum";
  return MATRIX[access.role][module];
}

/** A pergunta que as telas e as actions fazem. */
export function can(access: Access, module: Module, minimo: Level = "ver"): boolean {
  return nivelAtinge(levelFor(access, module), minimo);
}

/** Os módulos que aparecem no menu, na ordem de `MODULES`.
 *
 * Esconder do menu é conveniência, NUNCA proteção: quem souber o endereço
 * digita. Toda página e toda action checam `can()` do lado do servidor por
 * conta própria. */
export function visibleModules(access: Access): Module[] {
  return MODULES.filter((m) => can(access, m, "ver"));
}
