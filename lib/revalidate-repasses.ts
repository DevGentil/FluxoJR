import { revalidatePath } from "next/cache";

/** As três telas do módulo leem os mesmos dados por ângulos diferentes:
 * "Repasses Médicos" lista os lançamentos, "Médicos" o contrato que dá o
 * valor de cada um, e "Operação" a margem que sai do cruzamento dos dois.
 * Mexer em qualquer uma das pontas invalida as três — separar quem
 * invalida o quê só criaria tela desatualizada. */
export function revalidateRepassesModule() {
  revalidatePath("/repasses-medicos");
  revalidatePath("/medicos");
  revalidatePath("/operacao");
}
