import { TableSkeleton, PageHeaderSkeleton, FilterBarSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <FilterBarSkeleton />
      <TableSkeleton rows={8} />
    </div>
  );
}
