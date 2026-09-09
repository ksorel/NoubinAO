import { Skeleton } from "@/components/ui/skeleton";

export default function ChargementParametres() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full max-w-md" />
    </div>
  );
}
