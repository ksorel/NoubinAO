"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  listerNotifications,
  marquerNotificationLue,
  marquerToutesNotificationsLues,
} from "@/lib/notifications/actions";
import type { NotificationAvecAvis } from "@/lib/notifications/types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const t = useTranslations("Notifications");
  const [notifications, setNotifications] = useState<NotificationAvecAvis[]>([]);
  const [nonLues, setNonLues] = useState(0);
  const [, startTransition] = useTransition();

  useEffect(() => {
    listerNotifications()
      .then((resultat) => {
        setNotifications(resultat.notifications);
        setNonLues(resultat.nonLues);
      })
      .catch((erreur) => console.error("Échec du chargement des notifications", erreur));
  }, []);

  function marquerLue(id: string) {
    setNotifications((liste) => liste.map((n) => (n.id === id ? { ...n, lu: true } : n)));

    const notification = notifications.find((n) => n.id === id);
    if (notification?.lu) return;

    setNonLues((n) => Math.max(0, n - 1));
    startTransition(() => {
      marquerNotificationLue(id).catch((erreur) =>
        console.error("Échec du marquage lu", erreur),
      );
    });
  }

  function marquerToutesLues() {
    setNotifications((liste) => liste.map((n) => ({ ...n, lu: true })));
    setNonLues(0);
    startTransition(() => {
      marquerToutesNotificationsLues().catch((erreur) =>
        console.error("Échec du marquage tout lu", erreur),
      );
    });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={t("ariaLabel", { count: nonLues })}
        >
          <Bell className="h-5 w-5" />
          {nonLues > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {nonLues > 9 ? "9+" : nonLues}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">{t("titre")}</span>
          {nonLues > 0 && (
            <Button variant="ghost" size="sm" onClick={marquerToutesLues}>
              {t("toutMarquerLu")}
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("vide")}</p>
          )}
          {notifications.map((notification) => (
            <Link
              key={notification.id}
              href="/veille"
              onClick={() => marquerLue(notification.id)}
              className={cn(
                "block border-b px-3 py-2 text-sm last:border-b-0 hover:bg-accent",
                !notification.lu && "bg-primary/5 font-medium",
              )}
            >
              <span className="flex items-center gap-2">
                {!notification.lu && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                )}
                <span className="truncate">{notification.avis?.objet ?? t("avisSansObjet")}</span>
              </span>
              {notification.avis?.autorite_contractante && (
                <span className="block truncate pl-4 text-xs text-muted-foreground">
                  {notification.avis.autorite_contractante}
                </span>
              )}
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
