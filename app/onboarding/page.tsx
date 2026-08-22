import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";

export const instant = false;

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: authData, error } = await supabase.auth.getClaims();

  if (error || !authData?.claims) {
    redirect("/auth/login");
  }

  const { data: utilisateur } = await supabase
    .from("utilisateur")
    .select("id")
    .eq("id", authData.claims.sub)
    .maybeSingle();

  if (utilisateur) {
    redirect("/bibliotheque");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-5">
      <div className="flex flex-col gap-6 w-full max-w-md">
        <h1 className="text-2xl font-bold">Bienvenue sur NoubinAO</h1>
        <p className="text-muted-foreground">
          Créons d&apos;abord votre entreprise pour continuer.
        </p>
        <OnboardingForm />
      </div>
    </div>
  );
}
