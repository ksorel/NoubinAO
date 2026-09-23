"use client";

import { Fragment } from "react";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useFilAriane } from "@/lib/breadcrumb-context";

export function BreadcrumbTrail() {
  const items = useFilAriane();

  if (items.length === 0) return null;

  return (
    <Breadcrumb className="min-w-0">
      {/* flex-nowrap : un titre d'AO long ne doit jamais faire passer le
          fil d'Ariane sur plusieurs lignes (retour utilisateur). Seul le
          dernier élément (la page courante, souvent un titre d'AO) peut
          se réduire et se tronquer ; les éléments précédents (ex.
          "Appels d'offres") restent entiers. */}
      <BreadcrumbList className="flex-nowrap">
        {items.map((item, index) => {
          const dernier = index === items.length - 1;

          return (
            <Fragment key={`${item.label}-${index}`}>
              <BreadcrumbItem className={dernier ? "min-w-0" : "shrink-0"}>
                {dernier || !item.href ? (
                  <BreadcrumbPage className={dernier ? "block truncate" : undefined}>
                    {item.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={item.href}>{item.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!dernier && <BreadcrumbSeparator className="shrink-0" />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
