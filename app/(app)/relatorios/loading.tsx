import { KpiRowSkeleton, TableSkeleton, PageHeaderSkeleton, FilterBarSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <FilterBarSkeleton />
      <KpiRowSkeleton count={3} />
      <div className="grid gap-4 lg:grid-cols-2">
        <TableSkeleton rows={4} />
        <TableSkeleton rows={4} />
      </div>
      <TableSkeleton rows={3} />
    </div>
  );
}
