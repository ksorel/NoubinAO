import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { obtenirInvitationPublique, obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { InvitationForm } from "./invitation-form";

function PageShell({
  titre,
  description,
  children,
}: {
  titre: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{titre}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
          {children && <CardContent>{children}</CardContent>}
        </Card>
      </div>
    </div>
  );
}

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await obtenirInvitationPublique(token);

  if (!invitation.valide) {
    return (
      <PageShell titre="Invitation invalide">
        <p className="text-sm text-muted-foreground">
          Ce lien d&apos;invitation est invalide ou a expiré. Demande à l&apos;administrateur de
          ton entreprise d&apos;en créer un nouveau.
        </p>
      </PageShell>
    );
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const estAuthentifie = Boolean(authData?.claims?.sub);

  if (!estAuthentifie) {
    return (
      <PageShell
        titre={`Rejoindre ${invitation.entreprise_nom}`}
        description="Connecte-toi ou crée un compte pour accepter cette invitation."
      >
        <div className="flex flex-col gap-2">
          <Button asChild>
            <Link href={`/auth/login?next=/invitation/${token}`}>Se connecter</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/auth/sign-up?next=/invitation/${token}`}>Créer un compte</Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  const utilisateur = await obtenirUtilisateurCourant();
  if (utilisateur) {
    return (
      <PageShell titre="Déjà rattaché">
        <p className="text-sm text-muted-foreground">
          Tu es déjà rattaché à une entreprise. Un compte NoubinAO ne peut appartenir qu&apos;à
          une seule entreprise à la fois.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell
      titre={`Rejoindre ${invitation.entreprise_nom}`}
      description={`Tu vas rejoindre en tant que ${
        invitation.role === "admin" ? "administrateur" : "membre"
      }.`}
    >
      <InvitationForm token={token} />
    </PageShell>
  );
}
