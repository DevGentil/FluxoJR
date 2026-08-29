/** Seleção temporal do valor contratado.
 *
 * O contrato de um médico não é um número: é uma sequência de valores, cada
 * um valendo a partir de uma data. As planilhas provaram 13 reajustes reais
 * em 11 médicos — o ECG caiu de R$15 para R$10 em junho de 2026 para cinco
 * clínicos. Guardar só o valor atual apaga essa história e, pior, faz um dia
 * de maio lançado depois do reajuste congelar o valor de junho.
 *
 * Por isso cada reajuste é uma LINHA NOVA, e ler o contrato é sempre
 * perguntar "qual valor valia nesta data". */

export interface RateVersion {
  serviceItemId: string;
  /** Desde quando este valor vale. Meia-noite UTC, como toda data de
   * calendário do sistema (ver lib/date-only.ts). */
  validFrom: Date;
}

/** A versão que vale numa data: a mais recente que já entrou em vigor.
 *
 * Se a data for anterior a todas as versões conhecidas, devolve a mais
 * antiga. O sistema não sabe o que valia antes do primeiro registro, e
 * recusar o lançamento seria pior do que usar o único valor que ele conhece
 * — foi assim que a planilha sempre funcionou. */
export function versionOn<T extends { validFrom: Date }>(versions: T[], date: Date): T | undefined {
  if (versions.length === 0) return undefined;

  const ordered = [...versions].sort((a, b) => a.validFrom.getTime() - b.validFrom.getTime());
  let chosen = ordered[0];
  for (const v of ordered) {
    if (v.validFrom.getTime() <= date.getTime()) chosen = v;
    else break;
  }
  return chosen;
}

/** O contrato inteiro numa data: uma versão por item do catálogo. */
export function contractOn<T extends RateVersion>(rates: T[], date: Date): T[] {
  const byItem = new Map<string, T[]>();
  for (const r of rates) {
    const list = byItem.get(r.serviceItemId) ?? [];
    list.push(r);
    byItem.set(r.serviceItemId, list);
  }

  const result: T[] = [];
  for (const versions of byItem.values()) {
    const chosen = versionOn(versions, date);
    if (chosen) result.push(chosen);
  }
  return result;
}

/** Versões anteriores de um item, da mais recente para a mais antiga —
 * o histórico que a tela do médico mostra abaixo do valor vigente. */
export function previousVersions<T extends { validFrom: Date }>(versions: T[], date: Date): T[] {
  const atual = versionOn(versions, date);
  return versions
    .filter((v) => v !== atual)
    .sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime());
}

/** Reajustes que ainda vão entrar em vigor. Vale sinalizar na tela: o valor
 * que está sendo pago hoje não é o que foi combinado para o mês que vem. */
export function scheduledVersions<T extends { validFrom: Date }>(versions: T[], date: Date): T[] {
  return versions
    .filter((v) => v.validFrom.getTime() > date.getTime())
    .sort((a, b) => a.validFrom.getTime() - b.validFrom.getTime());
}
