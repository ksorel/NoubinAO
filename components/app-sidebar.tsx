import Link from "next/link";
import { Library, FileSearch } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

function IconMark() {
  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="NoubinAO"
      className="h-6 w-6"
    >
      <rect width="100" height="100" rx="22" fill="#1D4ED8" />
      <g transform="rotate(-45 50 50)">
        <polygon points="50,14 56,50 44,50" fill="#F8FAFC" />
        <polygon points="50,86 56,50 44,50" fill="#F59E0B" />
      </g>
      <circle cx="50" cy="50" r="4" fill="#FFFFFF" stroke="#1D4ED8" strokeWidth="1.5" />
    </svg>
  );
}

export async function AppSidebar() {
  const t = await getTranslations("Sidebar");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          href="/bibliotheque"
          className="flex items-center justify-center p-2"
        >
          <IconMark />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={t("bibliotheque")}>
              <Link href="/bibliotheque">
                <Library />
                <span>{t("bibliotheque")}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={t("appelsOffres")}>
              <Link href="/appels-offres">
                <FileSearch />
                <span>{t("appelsOffres")}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  );
}
