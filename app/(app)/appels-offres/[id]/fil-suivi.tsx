"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { lierEmailAAppelOffres, delierEmailAppelOffres } from "@/lib/email/actions";
import { calculerScoreCorrespondance } from "@/lib/email/correspondance";
import type { Email } from "@/lib/email/types";
import type { AppelOffres } from "@/lib/appels-offres/types";

const NB_SUGGESTIONS_MAX = 10;

export function FilSuivi({
  appelOffresId,
  appelOffres,
  emailsLies: emailsLiesInitial,
  emailsNonLies,
}: {
  appelOffresId: string;
  appelOffres: Pick<AppelOffres, "titre" | "acheteur" | "date_limite">;
  emailsLies: Email[];
  emailsNonLies: Email[];
}) {
  const t = useTranslations("AppelsOffres.detail.filSuivi");
  const [emailsLies, setEmailsLies] = useState(emailsLiesInitial);
  const [emailsRestants, setEmailsRestants] = useState(emailsNonLies);
  const [selectValue, setSelectValue] = useState("");
  const [isPending, startTransition] = useTransition();

  const suggestions = emailsRestants
    .map((email) => ({ email, score: calculerScoreCorrespondance(email, appelOffres) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, NB_SUGGESTIONS_MAX)
    .map(({ email }) => email);

  function onLier(emailId: string) {
    const email = emailsRestants.find((e) => e.id === emailId);
    if (!email) return;

    startTransition(async () => {
      const resultat = await lierEmailAAppelOffres(appelOffresId, emailId);
      if ("erreur" in resultat) {
        toast.error(t("erreurRattachement"));
        return;
      }
      setEmailsLies((liste) => [email, ...liste]);
      setEmailsRestants((liste) => liste.filter((e) => e.id !== emailId));
      setSelectValue("");
    });
  }

  function onDelier(emailId: string) {
    const precedent = emailsLies;
    setEmailsLies((liste) => liste.filter((e) => e.id !== emailId));

    startTransition(async () => {
      const resultat = await delierEmailAppelOffres(appelOffresId, emailId);
      if ("erreur" in resultat) {
        toast.error(t("erreurDissociation"));
        setEmailsLies(precedent);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {emailsLies.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("aucunEmailLie")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {emailsLies.map((email) => (
            <li key={email.id} className="border-b pb-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm">{email.objet ?? t("sansObjet")}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() => onDelier(email.id)}
                >
                  {t("delier")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{email.expediteur}</p>
            </li>
          ))}
        </ul>
      )}

      {suggestions.length > 0 ? (
        <Select value={selectValue} onValueChange={onLier} disabled={isPending}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("placeholderSelect")} />
          </SelectTrigger>
          <SelectContent>
            {suggestions.map((email) => (
              <SelectItem key={email.id} value={email.id}>
                {email.objet ?? t("sansObjet")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <p className="text-xs text-muted-foreground">{t("aucuneSuggestion")}</p>
      )}
    </div>
  );
}
