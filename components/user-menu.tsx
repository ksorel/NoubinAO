"use client";

import { LogOut, Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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

export function UserMenu({
  nomUtilisateur,
  nomEntreprise,
}: {
  nomUtilisateur: string;
  nomEntreprise: string;
}) {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  async function deconnecter() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
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
              Thème
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">
                <Sun className="mr-2 h-4 w-4" /> Clair
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon className="mr-2 h-4 w-4" /> Sombre
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Laptop className="mr-2 h-4 w-4" /> Système
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={deconnecter}>
            <LogOut className="mr-2 h-4 w-4" />
            Se déconnecter
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
