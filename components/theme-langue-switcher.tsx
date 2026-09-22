"use client";

import { Laptop, Moon, Sun, Languages } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setUserLocale } from "@/i18n/actions";
import type { Locale } from "@/i18n/locale";

export function ThemeLangueSwitcher({
  locale,
  labels,
}: {
  locale: Locale;
  labels: {
    theme: string;
    light: string;
    dark: string;
    system: string;
    language: string;
    french: string;
    english: string;
  };
}) {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  async function changerLangue(nouvelleLocale: string) {
    await setUserLocale(nouvelleLocale as Locale);
    window.location.reload();
  }

  if (!mounted) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          {theme === "light" ? (
            <Sun className="h-4 w-4 text-muted-foreground" />
          ) : theme === "dark" ? (
            <Moon className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Laptop className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {labels.theme}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <Sun className="mr-2 h-4 w-4" /> {labels.light}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon className="mr-2 h-4 w-4" /> {labels.dark}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Laptop className="mr-2 h-4 w-4" /> {labels.system}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {labels.language}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={locale} onValueChange={changerLangue}>
          <DropdownMenuRadioItem value="fr">
            <Languages className="mr-2 h-4 w-4" /> {labels.french}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en">
            <Languages className="mr-2 h-4 w-4" /> {labels.english}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
