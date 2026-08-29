import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Esqueletos das formas que se repetem nas telas. Existem para que a
 * navegação mostre o contorno da página imediatamente em vez de congelar na
 * tela anterior: cada página faz várias consultas a um Postgres remoto, e
 * sem `loading.tsx` o Next segura o render inteiro até a última voltar. */

/** Classes inteiras, não montadas por interpolação: o Tailwind varre o
 * código em busca de nomes literais e não enxerga `lg:grid-cols-${n}`. */
const KPI_COLS: Record<number, string> = {
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
  5: "sm:grid-cols-2 lg:grid-cols-5",
};

export function KpiRowSkeleton({ count = 4 }: { count?: 3 | 4 | 5 }) {
  return (
    <div className={`grid gap-4 ${KPI_COLS[count] ?? KPI_COLS[4]}`}>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="size-4 rounded" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6, title = true }: { rows?: number; title?: boolean }) {
  return (
    <Card>
      {title && (
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
      )}
      <CardContent className="space-y-3">
        <div className="flex gap-4 border-b pb-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex gap-4">
            {Array.from({ length: 5 }, (_, j) => (
              <Skeleton key={j} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function ChartSkeleton({ className = "h-72" }: { className?: string }) {
  return (
    <Card>
      <CardHeader className="space-y-2">
        <Skeleton className="h-5 w-52" />
        <Skeleton className="h-3 w-72" />
      </CardHeader>
      <CardContent>
        <Skeleton className={`${className} w-full`} />
      </CardContent>
    </Card>
  );
}

export function PageHeaderSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
    </div>
  );
}

export function FilterBarSkeleton() {
  return <Skeleton className="h-16 w-full rounded-xl" />;
}
