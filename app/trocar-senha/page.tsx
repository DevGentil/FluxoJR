import { trocarSenha } from "./actions";
import { NovaSenhaForm } from "@/components/nova-senha-form";
import { TelaAutenticacao } from "@/components/tela-autenticacao";

export default function TrocarSenhaPage() {
  return (
    <TelaAutenticacao>
      <div className="mb-6 text-center">
        <h1 className="font-heading text-xl font-semibold">Crie a sua senha</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A senha atual foi definida por quem cadastrou o seu acesso. Escolha uma que só você saiba
          para continuar.
        </p>
      </div>
      <NovaSenhaForm action={trocarSenha} rotulo="Salvar e entrar" />
    </TelaAutenticacao>
  );
}
