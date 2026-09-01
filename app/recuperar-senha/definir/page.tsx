import Link from "next/link";
import { definirSenha } from "./actions";
import { createClient } from "@/lib/supabase/server";
import { NovaSenhaForm } from "@/components/nova-senha-form";
import { TelaAutenticacao } from "@/components/tela-autenticacao";
import { Button } from "@/components/ui/button";
import { LinkIcon } from "lucide-react";

/** A sessão é conferida ANTES de desenhar o formulário.
 *
 * Quem chegou aqui com o link vencido merece ler isso agora, e não depois de
 * escolher uma senha, digitar duas vezes e só então tomar um erro. */
export default async function DefinirSenhaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <TelaAutenticacao>
        <div className="space-y-4 text-center">
          <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-muted">
            <LinkIcon className="size-5 text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            <h1 className="font-heading text-lg font-semibold">Este link não vale mais</h1>
            <p className="text-sm text-muted-foreground">
              Links de recuperação valem por uma hora e só podem ser usados uma vez. Peça um novo
              para continuar.
            </p>
          </div>
          <Button
            className="w-full"
            nativeButton={false}
            render={<Link href="/recuperar-senha" />}
          >
            Pedir um novo link
          </Button>
        </div>
      </TelaAutenticacao>
    );
  }

  return (
    <TelaAutenticacao>
      <div className="mb-6 text-center">
        <h1 className="font-heading text-xl font-semibold">Escolha a nova senha</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Você está redefinindo a senha de <span className="font-medium text-foreground">{user.email}</span>.
        </p>
      </div>
      <NovaSenhaForm action={definirSenha} rotulo="Salvar e entrar" />
    </TelaAutenticacao>
  );
}
