"use client";

import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { creerInvitation, revoquerInvitation } from "@/lib/utilisateur/actions";
import type { Invitation, RoleUtilisateur } from "@/lib/utilisateur/types";

export function EquipeCard({
  membres,
  invitationsInitiales,
}: {
  membres: { id: string; nom: string; role: RoleUtilisateur }[];
  invitationsInitiales: Invitation[];
}) {
  const t = useTranslations("Parametres.equipe");
  const formatter = useFormatter();
  const [invitations, setInvitations] = useState(invitationsInitiales);
  const [role, setRole] = useState<RoleUtilisateur>("membre");
  const [envoi, setEnvoi] = useState(false);
  const [lienGenere, setLienGenere] = useState<string | null>(null);
  const [revocationEnCoursId, setRevocationEnCoursId] = useState<string | null>(null);

  function libelleRole(r: RoleUtilisateur) {
    return r === "admin" ? t("roleAdmin") : t("roleMembre");
  }

  async function creer() {
    setEnvoi(true);
    const resultat = await creerInvitation({ role });
    setEnvoi(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setLienGenere(resultat.lien);
    setInvitations((liste) => [resultat.invitation, ...liste]);
    toast.success(t("toastInvitationCreee"));
  }

  async function copier(lien: string) {
    await navigator.clipboard.writeText(lien);
    toast.success(t("toastLienCopie"));
  }

  async function revoquer(id: string) {
    setRevocationEnCoursId(id);
    const resultat = await revoquerInvitation(id);
    setRevocationEnCoursId(null);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setInvitations((liste) => liste.filter((invitation) => invitation.id !== id));
    toast.success(t("toastRevoquee"));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("titre")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{t("sectionMembres")}</h3>
          <ul className="flex flex-col gap-2">
            {membres.map((membre) => (
              <li
                key={membre.id}
                className="flex items-center justify-between gap-2 border-b pb-2 text-sm"
              >
                <span>{membre.nom}</span>
                <span className="text-muted-foreground">{libelleRole(membre.role)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{t("sectionInvitations")}</h3>
          {invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("aucuneInvitation")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {invitations.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex items-center justify-between gap-2 border-b pb-2 text-sm"
                >
                  <span>
                    {libelleRole(invitation.role)} —{" "}
                    {t("expireLe", {
                      date: formatter.dateTime(new Date(invitation.expire_at), {
                        dateStyle: "short",
                      }),
                    })}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => revoquer(invitation.id)}
                    disabled={revocationEnCoursId !== null}
                  >
                    {revocationEnCoursId === invitation.id && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    {t("boutonRevoquer")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="invitation-role">{t("champRoleInvitation")}</Label>
            <Select value={role} onValueChange={(valeur) => setRole(valeur as RoleUtilisateur)}>
              <SelectTrigger id="invitation-role" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="membre">{t("roleMembre")}</SelectItem>
                <SelectItem value="admin">{t("roleAdmin")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={creer} disabled={envoi}>
            {envoi && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("boutonInviter")}
          </Button>
        </div>

        {lienGenere && (
          <div className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
            <span className="truncate">{lienGenere}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => copier(lienGenere)}
            >
              {t("boutonCopier")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
