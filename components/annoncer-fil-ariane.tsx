"use client";

import { useDefinirFilAriane, type FilArianeItem } from "@/lib/breadcrumb-context";

export function AnnoncerFilAriane({ items }: { items: FilArianeItem[] }) {
  useDefinirFilAriane(items);
  return null;
}
