import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import { LogoutButton } from "@/components/logout-button";
import { ThemeSwitcher } from "@/components/theme-switcher";

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
    .select("id")
    .eq("id", authData.claims.sub)
    .maybeSingle();

  if (!utilisateur) {
    redirect("/onboarding");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="w-full flex justify-center border-b h-16">
        <div className="w-full max-w-5xl flex justify-between items-center px-5">
          <Link href="/bibliotheque">
            <Logo className="h-8 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <ThemeSwitcher />
            <LogoutButton />
          </div>
        </div>
      </nav>
      <main className="flex-1 w-full max-w-5xl mx-auto p-5">{children}</main>
    </div>
  );
}
