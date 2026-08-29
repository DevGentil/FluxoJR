import { describe, expect, it } from "vitest";
import { contractOn, previousVersions, scheduledVersions, versionOn } from "./doctor-rates";
import { parseDateOnly } from "./date-only";

/** O caso real das planilhas: o ECG caiu de R$15 para R$10 em junho de 2026
 * para cinco clínicos. Antes de junho valia 15; de junho em diante, 10. */
const ecg = [
  { serviceItemId: "ecg", rate: 15, validFrom: parseDateOnly("2026-01-01") },
  { serviceItemId: "ecg", rate: 10, validFrom: parseDateOnly("2026-06-01") },
];

describe("versionOn", () => {
  it("usa o valor antigo num dia anterior ao reajuste", () => {
    expect(versionOn(ecg, parseDateOnly("2026-05-31"))?.rate).toBe(15);
  });

  it("usa o valor novo já no primeiro dia de vigência", () => {
    expect(versionOn(ecg, parseDateOnly("2026-06-01"))?.rate).toBe(10);
  });

  it("usa o valor novo depois do reajuste", () => {
    expect(versionOn(ecg, parseDateOnly("2026-08-29"))?.rate).toBe(10);
  });

  it("cai na versão mais antiga quando a data é anterior a tudo que se sabe", () => {
    // O sistema não sabe o que valia em 2025. Usar o valor mais antigo
    // conhecido é melhor que recusar o lançamento.
    expect(versionOn(ecg, parseDateOnly("2025-03-10"))?.rate).toBe(15);
  });

  it("não se importa com a ordem em que as versões chegam", () => {
    expect(versionOn([...ecg].reverse(), parseDateOnly("2026-05-31"))?.rate).toBe(15);
  });

  it("devolve undefined quando não há nenhuma versão", () => {
    expect(versionOn([], parseDateOnly("2026-06-01"))).toBeUndefined();
  });
});

describe("contractOn", () => {
  const contrato = [
    ...ecg,
    { serviceItemId: "consulta", rate: 32, validFrom: parseDateOnly("2026-01-01") },
    { serviceItemId: "consulta", rate: 34, validFrom: parseDateOnly("2026-07-01") },
    { serviceItemId: "us", rate: 45, validFrom: parseDateOnly("2026-02-15") },
  ];

  it("devolve uma linha por item, com o valor vigente na data", () => {
    const maio = contractOn(contrato, parseDateOnly("2026-05-20"));
    expect(maio).toHaveLength(3);
    expect(maio.find((r) => r.serviceItemId === "ecg")?.rate).toBe(15);
    expect(maio.find((r) => r.serviceItemId === "consulta")?.rate).toBe(32);
    expect(maio.find((r) => r.serviceItemId === "us")?.rate).toBe(45);
  });

  it("acompanha cada item no seu próprio reajuste", () => {
    // Em junho o ECG já mudou, mas a consulta só muda em julho.
    const junho = contractOn(contrato, parseDateOnly("2026-06-15"));
    expect(junho.find((r) => r.serviceItemId === "ecg")?.rate).toBe(10);
    expect(junho.find((r) => r.serviceItemId === "consulta")?.rate).toBe(32);

    const julho = contractOn(contrato, parseDateOnly("2026-07-15"));
    expect(julho.find((r) => r.serviceItemId === "consulta")?.rate).toBe(34);
  });

  it("devolve lista vazia para um médico sem contrato", () => {
    expect(contractOn([], parseDateOnly("2026-06-01"))).toEqual([]);
  });
});

describe("previousVersions", () => {
  it("lista o que já foi, da mais recente para a mais antiga", () => {
    const tres = [
      ...ecg,
      { serviceItemId: "ecg", rate: 12, validFrom: parseDateOnly("2026-03-01") },
    ];
    const anteriores = previousVersions(tres, parseDateOnly("2026-08-29"));
    expect(anteriores.map((v) => v.rate)).toEqual([12, 15]);
  });

  it("não lista nada quando só existe uma versão", () => {
    expect(previousVersions([ecg[0]], parseDateOnly("2026-08-29"))).toEqual([]);
  });
});

describe("scheduledVersions", () => {
  it("separa o reajuste que ainda vai entrar em vigor", () => {
    const futuros = scheduledVersions(ecg, parseDateOnly("2026-05-01"));
    expect(futuros.map((v) => v.rate)).toEqual([10]);
  });

  it("não considera futuro o que já entrou em vigor", () => {
    expect(scheduledVersions(ecg, parseDateOnly("2026-06-01"))).toEqual([]);
  });
});
