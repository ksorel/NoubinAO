import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "./ui/button";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "./logout-button";

export async function AuthButton() {
  const supabase = await createClient();
  const t = await getTranslations("Marketing.nav");

  // You can also use getUser() which will be slower.
  const { data } = await supabase.auth.getClaims();

  const user = data?.claims;

  return user ? (
    <div className="flex items-center gap-4">
      {t("bonjour", { email: user.email ?? "" })}
      <LogoutButton label={t("seDeconnecter")} />
    </div>
  ) : (
    <div className="flex gap-2">
      <Button asChild size="sm" variant={"outline"}>
        <Link href="/auth/login">{t("seConnecter")}</Link>
      </Button>
      <Button asChild size="sm" variant={"default"}>
        <Link href="/auth/sign-up">{t("sInscrire")}</Link>
      </Button>
    </div>
  );
}
