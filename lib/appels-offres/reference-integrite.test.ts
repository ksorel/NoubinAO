import { describe, expect, it } from "vitest";
import { calculerAlertesIntegrite, aUneAlerte, estReferenceRecevable } from "./reference-integrite";
import type { ReferenceProjet } from "./types";

function reference(overrides: Partial<ReferenceProjet> = {}): Pick<
  ReferenceProjet,
  | "client_date_creation"
  | "date_debut"
  | "date_fin"
  | "date_debut_origine"
  | "date_fin_origine"
  | "client_telephone"
  | "client_email"
  | "client_adresse"
> {
  return {
    client_date_creation: "2018-01-01",
    date_debut: "2022-01-01",
    date_fin: "2023-01-01",
    date_debut_origine: "2022-01-01",
    date_fin_origine: "2023-01-01",
    client_telephone: "+225 01 02 03 04 05",
    client_email: "client@example.com",
    client_adresse: "Abidjan, Cocody",
    ...overrides,
  };
}

const entreprise = { telephone: "+225 27 00 00 00 00", email: "contact@entreprise.ci", adresse: "Abidjan, Plateau" };

describe("calculerAlertesIntegrite", () => {
  it("aucune alerte sur une référence cohérente", () => {
    const alertes = calculerAlertesIntegrite(reference(), entreprise, null);
    expect(aUneAlerte(alertes)).toBe(false);
  });

  it("signale un client créé après le début du marché", () => {
    const alertes = calculerAlertesIntegrite(
      reference({ client_date_creation: "2022-06-01", date_debut: "2022-01-01" }),
      entreprise,
      null,
    );
    expect(alertes.clientAnterieurAuDebut).toBe(true);
  });

  it("ne signale rien quand une des deux dates manque", () => {
    const alertes = calculerAlertesIntegrite(
      reference({ client_date_creation: null }),
      entreprise,
      null,
    );
    expect(alertes.clientAnterieurAuDebut).toBe(false);
  });

  it("signale un téléphone client identique à celui du soumissionnaire", () => {
    const alertes = calculerAlertesIntegrite(
      reference({ client_telephone: entreprise.telephone }),
      entreprise,
      null,
    );
    expect(alertes.coordonneesPartagees).toBe(true);
  });

  it("signale un e-mail client identique (insensible à la casse)", () => {
    const alertes = calculerAlertesIntegrite(
      reference({ client_telephone: null, client_email: entreprise.email.toUpperCase() }),
      entreprise,
      null,
    );
    expect(alertes.coordonneesPartagees).toBe(true);
  });

  it("signale une ABE au format Word éditable", () => {
    const alertes = calculerAlertesIntegrite(reference(), entreprise, {
      mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(alertes.abeFormatEditableSansSignature).toBe(true);
  });

  it("ne signale rien pour une ABE en PDF", () => {
    const alertes = calculerAlertesIntegrite(reference(), entreprise, {
      mime_type: "application/pdf",
    });
    expect(alertes.abeFormatEditableSansSignature).toBe(false);
  });

  it("ne signale rien sans document ABE", () => {
    const alertes = calculerAlertesIntegrite(reference(), entreprise, null);
    expect(alertes.abeFormatEditableSansSignature).toBe(false);
  });

  it("signale une période modifiée depuis la première importation", () => {
    const alertes = calculerAlertesIntegrite(
      reference({ date_debut: "2022-03-01", date_debut_origine: "2022-01-01" }),
      entreprise,
      null,
    );
    expect(alertes.periodeModifiee).toBe(true);
  });

  it("ne signale rien quand aucune valeur d'origine n'a été capturée", () => {
    const alertes = calculerAlertesIntegrite(
      reference({ date_debut: "2022-03-01", date_debut_origine: null }),
      entreprise,
      null,
    );
    expect(alertes.periodeModifiee).toBe(false);
  });
});

describe("estReferenceRecevable", () => {
  it("recevable seulement avec une ABE et au moins un justificatif", () => {
    expect(estReferenceRecevable(true, 1)).toBe(true);
    expect(estReferenceRecevable(true, 0)).toBe(false);
    expect(estReferenceRecevable(false, 1)).toBe(false);
    expect(estReferenceRecevable(false, 0)).toBe(false);
  });
});
