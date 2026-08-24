import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="flex flex-col items-center gap-6 text-center py-16 px-4">
      <h1 className="text-3xl sm:text-4xl font-bold max-w-2xl">
        Une seule personne. Plusieurs appels d&apos;offres en parallèle.
      </h1>
      <p className="text-muted-foreground max-w-xl text-base sm:text-lg">
        NoubinAO centralise vos pièces administratives, vos références et le
        suivi de vos AO — pour sortir un dossier complet sans y consacrer
        plusieurs jours à chaque fois.
      </p>
      <div className="flex flex-col items-center gap-2">
        <Button asChild size="lg">
          <Link href="/auth/sign-up">Essai gratuit</Link>
        </Button>
        <span className="text-xs text-muted-foreground">
          Sans carte bancaire
        </span>
      </div>
    </section>
  );
}
