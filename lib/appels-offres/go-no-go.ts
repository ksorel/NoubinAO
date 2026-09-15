import type { CritereGoNoGo } from "./types";

export type VerdictGoNoGo = "go" | "no_go" | "en_attente";

export function calculerVerdictGoNoGo(
  critereJuridique: CritereGoNoGo,
  critereFaisabilite: CritereGoNoGo,
  critereRentabilite: CritereGoNoGo,
): VerdictGoNoGo {
  if (
    critereJuridique === "non" ||
    critereFaisabilite === "non" ||
    critereRentabilite === "non"
  ) {
    return "no_go";
  }

  if (
    critereJuridique === "oui" &&
    critereFaisabilite === "oui" &&
    critereRentabilite === "oui"
  ) {
    return "go";
  }

  return "en_attente";
}
