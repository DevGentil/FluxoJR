import { KpiRowSkeleton, TableSkeleton, PageHeaderSkeleton, FilterBarSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <FilterBarSkeleton />
      <KpiRowSkeleton count={3} />
      <TableSkeleton rows={5} />
      <div className="grid gap-4 lg:grid-cols-2">
        <TableSkeleton rows={3} />
        <TableSkeleton rows={3} />
      </div>
    </div>
  );
}
