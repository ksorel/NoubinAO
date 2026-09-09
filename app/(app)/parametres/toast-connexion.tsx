"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

export function ToastConnexion({
  succes,
  erreur,
}: {
  succes: string | null;
  erreur: string | null;
}) {
  const t = useTranslations("Parametres.toast");
  const router = useRouter();

  useEffect(() => {
    if (succes) {
      toast.success(t("gmailConnecte"));
      router.replace("/parametres");
      return;
    }

    if (erreur) {
      const messagesErreur: Record<string, string> = {
        consentement_refuse: t("erreurConsentementRefuse"),
        state_invalide: t("erreurStateInvalide"),
        echange_echoue: t("erreurEchangeEchoue"),
        enregistrement_echoue: t("erreurEnregistrementEchoue"),
      };
      toast.error(messagesErreur[erreur] ?? t("erreurGenerique"));
      router.replace("/parametres");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [succes, erreur]);

  return null;
}
