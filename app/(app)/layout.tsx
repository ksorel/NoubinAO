import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  obtenirUtilisateurCourant,
  obtenirNomEntreprise,
  listerMesEntreprises,
} from "@/lib/utilisateur/queries";
import { obtenirCompteEmailConnecte } from "@/lib/email/queries";
import { AppSidebar } from "@/components/app-sidebar";
import { AlerteCompteEmail } from "@/components/alerte-compte-email";
import { UserMenu } from "@/components/user-menu";
import { NotificationBell } from "@/components/notification-bell";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { BreadcrumbProvider } from "@/lib/breadcrumb-context";
import { BreadcrumbTrail } from "@/components/breadcrumb-trail";
import { NextIntlClientProvider } from "next-intl";
import { getUserLocale } from "@/i18n/locale";

export const instant = false;

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: authData, error } = await supabase.auth.getClaims();

  if (error || !authData?.claims) {
    redirect("/auth/login");
  }

  const utilisateur = await obtenirUtilisateurCourant();

  if (!utilisateur) {
    redirect("/onboarding");
  }

  const [nomEntreprise, mesEntreprises, compteEmail] = await Promise.all([
    obtenirNomEntreprise(utilisateur.entreprise_id),
    listerMesEntreprises(),
    obtenirCompteEmailConnecte(utilisateur.id),
  ]);

  // On lit le cookie et les messages directement plutôt que via
  // getLocale()/getMessages() de next-intl/server : pendant le
  // développement de cette fonctionnalité, passer par la résolution de
  // config de next-intl (i18n/request.ts) a semblé parfois servir une
  // locale obsolète après un changement de langue. Cause racine non
  // confirmée avec certitude (plusieurs facteurs possibles observés
  // pendant le débogage : cache .next corrompu par des éditions répétées
  // de next.config.ts, état HMR obsolète, éventuelle interaction avec
  // cacheComponents) - ne pas supposer que cacheComponents est forcément
  // en cause. La lecture directe ci-dessous a été vérifiée fiable de bout
  // en bout ; i18n/request.ts reste requis par next-intl/plugin mais
  // n'est plus utilisé pour cette valeur (voir son commentaire).
  const locale = await getUserLocale();
  const messages = (await import(`@/messages/${locale}.json`)).default;

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <SidebarProvider defaultOpen={false}>
        <AppSidebar />
        <SidebarInset>
          <BreadcrumbProvider>
            {compteEmail?.statut === "erreur" && <AlerteCompteEmail />}
            <header className="flex h-14 items-center justify-between border-b px-4">
              <div className="flex min-w-0 items-center gap-2">
                <SidebarTrigger />
                <BreadcrumbTrail />
              </div>
              <div className="flex items-center gap-1">
                <NotificationBell />
                <UserMenu
                  nomUtilisateur={utilisateur.nom}
                  nomEntreprise={nomEntreprise ?? ""}
                  mesEntreprises={mesEntreprises}
                  entrepriseActiveId={utilisateur.entreprise_id}
                />
              </div>
            </header>
            <main className="flex-1 p-5">{children}</main>
          </BreadcrumbProvider>
        </SidebarInset>
      </SidebarProvider>
    </NextIntlClientProvider>
  );
}
