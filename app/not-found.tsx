import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <Compass className="size-10 text-muted-foreground" />
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Essa página não existe</h1>
        <p className="text-muted-foreground text-sm">
          O endereço pode ter mudado, ou o registro que você procurava foi excluído.
        </p>
      </div>
      <Button nativeButton={false} render={<Link href="/dashboard" />}>
        Ir para o Dashboard
      </Button>
    </div>
  );
}
