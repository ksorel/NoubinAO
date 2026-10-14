"use client";

import { LogOut, Laptop, Moon, Sun, Languages } from "lucide-react";
import { useTheme } from "next-themes";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { setUserLocale } from "@/i18n/actions";
import type { Locale } from "@/i18n/locale";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deriverInitiales } from "@/lib/utilisateur/initiales";
import { changerEntrepriseActive } from "@/lib/utilisateur/actions";
import type { RoleUtilisateur } from "@/lib/utilisateur/types";
import Link from "next/link";
import { toast } from "sonner";

export function UserMenu({
  nomUtilisateur,
  nomEntreprise,
  mesEntreprises,
  entrepriseActiveId,
}: {
  nomUtilisateur: string;
  nomEntreprise: string;
  mesEntreprises: { entreprise_id: string; nom: string; role: RoleUtilisateur }[];
  entrepriseActiveId: string;
}) {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();
  const locale = useLocale();
  const t = useTranslations("UserMenu");
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  async function deconnecter() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  async function changerLangue(nouvelleLocale: string) {
    await setUserLocale(nouvelleLocale as Locale);
    window.location.reload();
  }

  async function basculerEntreprise(entrepriseId: string) {
    const resultat = await changerEntrepriseActive(entrepriseId);
    if (resultat && "erreur" in resultat) {
      toast.error(resultat.erreur);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
          {deriverInitiales(nomUtilisateur)}
        </span>
        <span>{nomEntreprise}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{nomUtilisateur}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {mounted && (
          <>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              {t("theme")}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">
                <Sun className="mr-2 h-4 w-4" /> {t("light")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon className="mr-2 h-4 w-4" /> {t("dark")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Laptop className="mr-2 h-4 w-4" /> {t("system")}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              {t("language")}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup value={locale} onValueChange={changerLangue}>
              <DropdownMenuRadioItem value="fr">
                <Languages className="mr-2 h-4 w-4" /> {t("french")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="en">
                <Languages className="mr-2 h-4 w-4" /> {t("english")}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
          </>
        )}
        {mesEntreprises.length > 1 && (
          <>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              {t("entreprise")}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup value={entrepriseActiveId} onValueChange={basculerEntreprise}>
              {mesEntreprises.map((e) => (
                <DropdownMenuRadioItem key={e.entreprise_id} value={e.entreprise_id}>
                  {e.nom}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {e.role === "admin" ? "Admin" : "Membre"}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        )}
        {/* Toujours visible, même avec une seule entreprise (100% des
            utilisateurs actuels) : sinon la fonctionnalité "créer une
            deuxième entreprise" n'est découvrable par personne. Le
            sélecteur juste au-dessus, lui, reste conditionnel — inutile
            avec une seule option. */}
        <DropdownMenuItem asChild>
          <Link href="/entreprises/nouvelle">{t("nouvelleEntreprise")}</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={deconnecter}>
            <LogOut className="mr-2 h-4 w-4" />
            {t("logout")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
