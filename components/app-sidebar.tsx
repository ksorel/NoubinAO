import Link from "next/link";
import { Library, FileSearch, Kanban, Settings } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

function IconMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="NoubinAO"
      className={cn("h-6 w-6", className)}
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
        <Link href="/bibliotheque" className="flex items-center gap-2 p-2">
          <IconMark className="shrink-0" />
          <span className="truncate text-lg group-data-[collapsible=icon]/icon:hidden">
            <span className="text-slate-900 dark:text-slate-50">Noubin</span>
            <span className="font-bold text-primary">AO</span>
          </span>
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
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={t("pipeline")}>
              <Link href="/pipeline">
                <Kanban />
                <span>{t("pipeline")}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={t("reglages")}>
              <Link href="/parametres">
                <Settings />
                <span>{t("reglages")}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  );
}
