import Link from "next/link";
import { ThemeSwitcher } from "@/components/theme-switcher";

export function SiteFooter() {
  return (
    <footer className="flex items-center justify-center gap-8 border-t py-8 px-4 text-center text-xs text-muted-foreground">
      <p>NoubinAO — un produit K-Nowledge</p>
      <Link href="/confidentialite" className="underline">
        Confidentialité
      </Link>
      <ThemeSwitcher />
    </footer>
  );
}
