import {
  KpiRowSkeleton,
  ChartSkeleton,
  TableSkeleton,
  PageHeaderSkeleton,
  FilterBarSkeleton,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <FilterBarSkeleton />
      <KpiRowSkeleton count={5} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
      <TableSkeleton rows={5} />
      <TableSkeleton rows={5} />
    </div>
  );
}
