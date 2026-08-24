"use client";

import { createContext, useContext, useEffect, useState } from "react";

export interface FilArianeItem {
  label: string;
  href?: string;
}

interface BreadcrumbContextValue {
  items: FilArianeItem[];
  setItems: (items: FilArianeItem[]) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

export function BreadcrumbProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [items, setItems] = useState<FilArianeItem[]>([]);

  return (
    <BreadcrumbContext.Provider value={{ items, setItems }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useDefinirFilAriane(items: FilArianeItem[]) {
  const context = useContext(BreadcrumbContext);
  const cleIdentite = items.map((item) => `${item.label}|${item.href ?? ""}`).join(",");

  useEffect(() => {
    if (!context) return;
    context.setItems(items);
    return () => context.setItems([]);
    // items est reconstruit à chaque rendu par l'appelant (tableau littéral) ;
    // cleIdentite en est une représentation stable qui ne change que si le
    // contenu change réellement, évitant une boucle d'effet infinie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleIdentite]);
}

export function useFilAriane(): FilArianeItem[] {
  const context = useContext(BreadcrumbContext);
  return context?.items ?? [];
}
