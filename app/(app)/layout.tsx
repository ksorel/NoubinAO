import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";
import { UserMenu } from "@/components/user-menu";
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

  const { data: utilisateur } = await supabase
    .from("utilisateur")
    .select("id, nom, entreprise:entreprise_id(nom)")
    .eq("id", authData.claims.sub)
    .maybeSingle();

  if (!utilisateur) {
    redirect("/onboarding");
  }

  // Le client Supabase n'est pas typé avec un générique Database, donc
  // postgrest-js ne peut pas déduire la cardinalité de la relation à partir
  // de la seule chaîne de sélection : il type l'embed `entreprise` comme un
  // tableau (`{ nom: any }[]`) par défaut. En réalité, `entreprise_id` est
  // une relation plusieurs-à-un (chaque utilisateur appartient à une seule
  // entreprise), donc Supabase renvoie un objet unique à l'exécution. On
  // recadre le type ici plutôt que d'indexer `[0]`, ce qui serait incorrect
  // si l'hypothèse documentée sur le comportement runtime est correcte.
  const entreprise = utilisateur.entreprise as unknown as {
    nom: string;
  } | null;

  // On lit le cookie et les messages directement plutôt que via
  // getLocale()/getMessages() de next-intl/server : lors du développement
  // de cette fonctionnalité, passer par la résolution de config de
  // next-intl (i18n/request.ts) a semblé parfois servir une locale
  // obsolète après un changement de langue sous cacheComponents. La lecture
  // directe ci-dessous a été vérifiée fiable ; i18n/request.ts reste requis
  // par next-intl/plugin mais n'est plus utilisé pour cette valeur.
  const locale = await getUserLocale();
  const messages = (await import(`@/messages/${locale}.json`)).default;

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <BreadcrumbProvider>
            <header className="flex h-14 items-center justify-between border-b px-4">
              <div className="flex items-center gap-2">
                <SidebarTrigger />
                <BreadcrumbTrail />
              </div>
              <UserMenu
                nomUtilisateur={utilisateur.nom}
                nomEntreprise={entreprise?.nom ?? ""}
              />
            </header>
            <main className="flex-1 p-5">{children}</main>
          </BreadcrumbProvider>
        </SidebarInset>
      </SidebarProvider>
    </NextIntlClientProvider>
  );
}
