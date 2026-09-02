"use client";

import { useTranslations } from "next-intl";

export default function ErreurPipeline({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const t = useTranslations("Pipeline.error");

  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="text-muted-foreground">{t("message")}</p>
      <button
        onClick={reset}
        className="text-sm font-medium text-primary underline underline-offset-4"
      >
        {t("reessayer")}
      </button>
    </div>
  );
}
