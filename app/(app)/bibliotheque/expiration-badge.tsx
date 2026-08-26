"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { calculerStatutExpiration } from "@/lib/documents/expiration";

const STYLES = {
  rouge: "bg-destructive text-destructive-foreground border-transparent",
  orange: "bg-[hsl(var(--status-soumis))] text-slate-900 border-transparent",
  vert: "bg-[hsl(var(--status-gagne))] text-slate-900 border-transparent",
} as const;

export function ExpirationBadge({
  dateExpiration,
}: {
  dateExpiration: string | null;
}) {
  const t = useTranslations("Bibliotheque.badge");
  const statut = calculerStatutExpiration(dateExpiration);

  if (!statut) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }

  const labels = {
    rouge: t("expireBientot"),
    orange: t("aSurveiller"),
    vert: t("valide"),
  } as const;

  return (
    <Badge variant="outline" className={STYLES[statut]}>
      {labels[statut]}
    </Badge>
  );
}
