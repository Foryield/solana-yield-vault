import { describe, expect, it, vi } from "vitest";
import { provisionner } from "../src/provisionner.js";

const sansAttente = { delaiMs: 0, attendre: async () => {} };

describe("provisionner", () => {
  it("ne demande jamais qu'un reseau de test", async () => {
    const client = {
      wallets: {
        createWallet: vi.fn().mockResolvedValue({ id: "wa-1", address: "Sol1" }),
      },
    };
    await provisionner(client as never, "porteur@exemple.test", sansAttente);
    expect(client.wallets.createWallet).toHaveBeenCalledWith({
      body: { network: "SolanaDevnet", name: "porteur@exemple.test" },
    });
  });

  it("rend l'identifiant et l'adresse", async () => {
    const client = {
      wallets: {
        createWallet: vi.fn().mockResolvedValue({ id: "wa-1", address: "Sol1" }),
      },
    };
    await expect(
      provisionner(client as never, "porteur", sansAttente),
    ).resolves.toEqual({ walletId: "wa-1", adresse: "Sol1" });
  });

  /**
   * La creation d'une cle est asynchrone chez le fournisseur : l'adresse peut
   * manquer dans la reponse immediate. Echouer d'emblee laisserait un
   * portefeuille cree, facture et introuvable.
   */
  it("relit le portefeuille quand l'adresse manque encore", async () => {
    const client = {
      wallets: {
        createWallet: vi.fn().mockResolvedValue({ id: "wa-2" }),
        getWallet: vi
          .fn()
          .mockResolvedValueOnce({ id: "wa-2" })
          .mockResolvedValueOnce({ id: "wa-2", address: "Sol2" }),
      },
    };
    await expect(
      provisionner(client as never, "porteur", sansAttente),
    ).resolves.toEqual({ walletId: "wa-2", adresse: "Sol2" });
    expect(client.wallets.getWallet).toHaveBeenCalledTimes(2);
  });

  it("nomme le portefeuille orphelin quand il renonce", async () => {
    const client = {
      wallets: {
        createWallet: vi.fn().mockResolvedValue({ id: "wa-3" }),
        getWallet: vi.fn().mockResolvedValue({ id: "wa-3" }),
      },
    };
    await expect(
      provisionner(client as never, "porteur", { ...sansAttente, tentatives: 2 }),
    ).rejects.toThrow(/wa-3/);
  });
});
