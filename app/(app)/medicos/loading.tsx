import { KpiRowSkeleton, TableSkeleton, PageHeaderSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <KpiRowSkeleton count={3} />
      <TableSkeleton rows={6} />
    </div>
  );
}
