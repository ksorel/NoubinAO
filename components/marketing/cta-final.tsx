import Link from "next/link";
import { Button } from "@/components/ui/button";

export function CtaFinal() {
  return (
    <section className="py-16 px-4 bg-primary text-center">
      <h2 className="text-primary-foreground text-xl font-bold mb-6 max-w-md mx-auto">
        Prêt à traiter plus d&apos;AO avec la même équipe ?
      </h2>
      <Button
        asChild
        size="lg"
        className="bg-accent text-accent-foreground hover:bg-accent/90"
      >
        <Link href="/auth/sign-up">Essai gratuit</Link>
      </Button>
    </section>
  );
}
