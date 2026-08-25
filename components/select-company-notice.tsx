import { Card, CardContent } from "@/components/ui/card";
import { Building2 } from "lucide-react";

export function SelectCompanyNotice({ what }: { what: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <Building2 className="size-8 text-muted-foreground" />
        <p className="text-muted-foreground max-w-sm">
          Selecione uma empresa específica no menu à esquerda para {what}. Essa
          tela não está disponível em uma visão consolidada (grupo/holding).
        </p>
      </CardContent>
    </Card>
  );
}
