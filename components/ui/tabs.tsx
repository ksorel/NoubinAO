"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
        className
      )}
      {...props}
    />
  )
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        // Onglets classiques (soulignement), pas le "segmented control" par
        // défaut de shadcn/ui (2026-09) : la variante pilule d'origine se
        // confondait avec un groupe de boutons, l'utilisateur ne
        // comprenait pas que c'étaient des onglets. Le trait plein sous
        // tout le groupe + le trait de couleur qui ne dépasse que sous
        // l'onglet actif est le repère visuel standard d'un onglet web.
        "group/tabs-list flex w-full items-center gap-4 border-b border-border group-data-[orientation=vertical]/tabs:w-fit group-data-[orientation=vertical]/tabs:flex-col group-data-[orientation=vertical]/tabs:items-start group-data-[orientation=vertical]/tabs:border-b-0 group-data-[orientation=vertical]/tabs:border-r",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "-mb-px inline-flex items-center justify-center gap-1.5 rounded-sm whitespace-nowrap border-b-2 border-transparent px-1 pb-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-primary data-[state=active]:font-semibold data-[state=active]:text-foreground group-data-[orientation=vertical]/tabs-list:mb-0 group-data-[orientation=vertical]/tabs-list:w-full group-data-[orientation=vertical]/tabs-list:justify-start group-data-[orientation=vertical]/tabs-list:border-r-2 group-data-[orientation=vertical]/tabs-list:border-b-0 group-data-[orientation=vertical]/tabs-list:pr-2 group-data-[orientation=vertical]/tabs-list:pb-0 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
