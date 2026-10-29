import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";

// Bannière globale (affichée sur tout l'espace applicatif, pas seulement
// /parametres) : un compte email en erreur (le plus souvent un refresh
// token Gmail expiré, voir la note GOOGLE_CLIENT_ID dans CLAUDE.md) ne
// doit pas rester un détail enfoui dans les réglages - le propriétaire du
// compte doit le voir dès qu'il ouvre l'application, quelle que soit la
// page, sinon la synchronisation reste silencieusement arrêtée pendant des
// semaines (sprint S1 "parcours expert v2").
export async function AlerteCompteEmail() {
  const t = await getTranslations("Parametres.gmail");

  return (
    <div className="flex items-center gap-2 border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
      <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{t("statutErreur")}</span>
      <Link href="/parametres" className="shrink-0 font-medium underline underline-offset-4">
        {t("banniereLien")}
      </Link>
    </div>
  );
}
