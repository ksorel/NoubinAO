"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PaginationControls({
  page,
  totalPages,
  onPageChange,
  labelPrecedent,
  labelSuivant,
  labelIndicateur,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  labelPrecedent: string;
  labelSuivant: string;
  labelIndicateur: string;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft className="size-4" />
        {labelPrecedent}
      </Button>
      <span className="text-sm text-muted-foreground">{labelIndicateur}</span>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        {labelSuivant}
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
