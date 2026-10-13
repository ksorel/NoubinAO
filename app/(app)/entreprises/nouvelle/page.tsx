import { OnboardingForm } from "@/app/onboarding/onboarding-form";

export const instant = false;

export default function NouvelleEntreprisePage() {
  return (
    <div className="flex flex-col gap-6 max-w-md">
      <h1 className="text-2xl font-bold">Créer une nouvelle entreprise</h1>
      <p className="text-muted-foreground">
        Chaque entreprise a son propre espace NoubinAO (AO, bibliothèque, pipeline).
      </p>
      <OnboardingForm />
    </div>
  );
}
