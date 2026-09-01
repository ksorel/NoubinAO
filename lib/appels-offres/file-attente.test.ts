import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const publishJSONMock = vi.fn();

// Pattern identique à celui validé au sous-projet 2 (ocr.test.ts,
// extraire.test.ts) pour contourner le hoisting de vi.mock : une classe
// avec un getter, plutôt que vi.fn().mockImplementation() qui lirait
// publishJSONMock avant son initialisation.
vi.mock("@upstash/qstash", () => ({
  Client: class {
    get publishJSON() {
      return publishJSONMock;
    }
  },
}));

import { mettreEnFileTraitementDao } from "./file-attente";

describe("mettreEnFileTraitementDao", () => {
  const urlOriginale = process.env.VERCEL_URL;

  beforeEach(() => {
    publishJSONMock.mockReset();
    publishJSONMock.mockResolvedValue({ messageId: "msg-1" });
  });

  afterEach(() => {
    process.env.VERCEL_URL = urlOriginale;
  });

  it("publie un message QStash avec l'id de l'AO et le mimeType", async () => {
    await mettreEnFileTraitementDao("ao-1", "application/pdf");

    expect(publishJSONMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { appelOffresId: "ao-1", mimeType: "application/pdf" },
      }),
    );
  });

  it("cible /api/dao/traiter sur le domaine Vercel quand VERCEL_URL est défini", async () => {
    process.env.VERCEL_URL = "noubinao-exemple.vercel.app";

    await mettreEnFileTraitementDao("ao-1", "application/pdf");

    expect(publishJSONMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://noubinao-exemple.vercel.app/api/dao/traiter",
      }),
    );
  });

  it("retombe sur localhost:3000 quand VERCEL_URL est absent", async () => {
    delete process.env.VERCEL_URL;

    await mettreEnFileTraitementDao("ao-1", "application/pdf");

    expect(publishJSONMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "http://localhost:3000/api/dao/traiter",
      }),
    );
  });
});
