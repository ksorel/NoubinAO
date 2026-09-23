"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";

const SEUIL_PAGE_LONGUE_PX = 600;
const SEUIL_PRES_DU_BAS_PX = 80;

export function ScrollToEdgeButton({
  labelBas,
  labelHaut,
}: {
  labelBas: string;
  labelHaut: string;
}) {
  const [visible, setVisible] = useState(false);
  const [presDuBas, setPresDuBas] = useState(false);

  useEffect(() => {
    function verifier() {
      const hauteurDocument = document.documentElement.scrollHeight;
      setVisible(hauteurDocument - window.innerHeight > SEUIL_PAGE_LONGUE_PX);
      setPresDuBas(
        window.scrollY + window.innerHeight >= hauteurDocument - SEUIL_PRES_DU_BAS_PX,
      );
    }
    verifier();
    window.addEventListener("scroll", verifier, { passive: true });
    window.addEventListener("resize", verifier);
    return () => {
      window.removeEventListener("scroll", verifier);
      window.removeEventListener("resize", verifier);
    };
  }, []);

  if (!visible) return null;

  function aller() {
    window.scrollTo({
      top: presDuBas ? 0 : document.documentElement.scrollHeight,
      behavior: "smooth",
    });
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      onClick={aller}
      aria-label={presDuBas ? labelHaut : labelBas}
      title={presDuBas ? labelHaut : labelBas}
      className="fixed right-4 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-40 rounded-full border border-border shadow-lg"
    >
      {presDuBas ? <ArrowUp className="size-5" /> : <ArrowDown className="size-5" />}
    </Button>
  );
}
