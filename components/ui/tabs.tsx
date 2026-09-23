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
        // Onglets "languette de classeur" (2026-09, 2e itération) : le
        // simple soulignement restait ambigu pour l'utilisateur. Chaque
        // déclencheur a des coins arrondis en haut et pas de bordure basse ;
        // il repose sur le trait qui ferme tout le groupe. L'onglet actif a
        // un fond identique à la page qui efface ce trait sous lui et se
        // fond dans le panneau de contenu — le repère visuel le plus
        // reconnaissable pour "ceci est un onglet" (navigateur, classeur).
        // overflow-x-auto : sur mobile, une liste à 7-8 onglets (ex. statuts
        // pipeline) ne tient pas sur un seul écran.
        "group/tabs-list flex w-full items-end gap-1 overflow-x-auto border-b-2 border-border group-data-[orientation=vertical]/tabs:w-fit group-data-[orientation=vertical]/tabs:flex-col group-data-[orientation=vertical]/tabs:items-stretch group-data-[orientation=vertical]/tabs:overflow-visible group-data-[orientation=vertical]/tabs:border-r-2 group-data-[orientation=vertical]/tabs:border-b-0",
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
        "-mb-0.5 inline-flex shrink-0 items-center justify-center gap-1.5 rounded-t-lg border border-b-0 border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-border data-[state=active]:bg-background data-[state=active]:font-semibold data-[state=active]:text-foreground group-data-[orientation=vertical]/tabs-list:-mr-0.5 group-data-[orientation=vertical]/tabs-list:mb-0 group-data-[orientation=vertical]/tabs-list:justify-start group-data-[orientation=vertical]/tabs-list:rounded-t-none group-data-[orientation=vertical]/tabs-list:rounded-l-lg group-data-[orientation=vertical]/tabs-list:border-r-0 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
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
