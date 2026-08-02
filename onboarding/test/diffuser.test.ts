import { describe, expect, it, vi } from "vitest";
import { attendreConfirmation, diffuser } from "../src/diffuser.js";

const sansAttente = { delaiMs: 0, attendre: async () => {} };

describe("diffuser", () => {
  it("envoie la transaction telle quelle a la garde", async () => {
    const client = {
      wallets: {
        broadcastTransaction: vi.fn().mockResolvedValue({
          id: "tx-1",
          status: "Broadcasted",
          txHash: "signature1",
        }),
      },
    };
    const r = await diffuser(client as never, "wa-1", "0xdeadbeef", sansAttente);
    expect(client.wallets.broadcastTransaction).toHaveBeenCalledWith({
      walletId: "wa-1",
      body: { kind: "Transaction", transaction: "0xdeadbeef" },
    });
    expect(r).toEqual({
      requestId: "tx-1",
      statut: "Broadcasted",
      signature: "signature1",
    });
  });

  /**
   * LE CAS QUI AURAIT CASSE LE PREMIER ESSAI REEL. Une demande de diffusion est
   * asynchrone : `Pending` et `Executing` sont des etats de passage normaux, et
   * ils deviendront la regle sous une politique d'approbation. Exiger
   * `Broadcasted` des la reponse initiale accusait la garde de ne pas avoir
   * diffuse alors qu'elle etait en train de le faire.
   */
  it("relit la demande tant qu'elle est en cours", async () => {
    const client = {
      wallets: {
        broadcastTransaction: vi
          .fn()
          .mockResolvedValue({ id: "tx-2", status: "Pending" }),
        getTransaction: vi
          .fn()
          .mockResolvedValueOnce({ id: "tx-2", status: "Executing" })
          .mockResolvedValueOnce({
            id: "tx-2",
            status: "Broadcasted",
            txHash: "signature2",
          }),
      },
    };
    const r = await diffuser(client as never, "wa-1", "0x00", sansAttente);
    expect(r.signature).toBe("signature2");
    expect(client.wallets.getTransaction).toHaveBeenCalledWith({
      walletId: "wa-1",
      transactionId: "tx-2",
    });
  });

  it("accepte une demande deja confirmee par la garde", async () => {
    const client = {
      wallets: {
        broadcastTransaction: vi.fn().mockResolvedValue({
          id: "tx-4",
          status: "Confirmed",
          txHash: "signature4",
        }),
      },
    };
    await expect(
      diffuser(client as never, "wa-1", "0x00", sansAttente),
    ).resolves.toMatchObject({ signature: "signature4" });
  });

  it("echoue fort sur un refus, en reportant le motif", async () => {
    const client = {
      wallets: {
        broadcastTransaction: vi.fn().mockResolvedValue({
          id: "tx-3",
          status: "Rejected",
          reason: "insufficient funds for fee",
        }),
      },
    };
    await expect(
      diffuser(client as never, "wa-1", "0x00", sansAttente),
    ).rejects.toThrow(/insufficient funds/);
  });

  it("renonce en nommant l'approbation possible", async () => {
    const client = {
      wallets: {
        broadcastTransaction: vi
          .fn()
          .mockResolvedValue({ id: "tx-5", status: "Pending" }),
        getTransaction: vi.fn().mockResolvedValue({ id: "tx-5", status: "Pending" }),
      },
    };
    await expect(
      diffuser(client as never, "wa-1", "0x00", { ...sansAttente, tentatives: 3 }),
    ).rejects.toThrow(/approbation/);
  });

  it("refuse une diffusion annoncee sans empreinte", async () => {
    const client = {
      wallets: {
        broadcastTransaction: vi
          .fn()
          .mockResolvedValue({ id: "tx-6", status: "Broadcasted" }),
      },
    };
    await expect(
      diffuser(client as never, "wa-1", "0x00", sansAttente),
    ).rejects.toThrow(/empreinte/);
  });
});

describe("attendreConfirmation", () => {
  const lecteur = (...reponses: unknown[]) => ({
    getSignatureStatuses: vi.fn(
      async () => ({ value: [reponses.shift() ?? null] }) as never,
    ),
  });

  it("rend le slot quand la transaction aboutit", async () => {
    const l = lecteur({ slot: 42, err: null, confirmationStatus: "confirmed" });
    await expect(
      attendreConfirmation(l as never, "sig", sansAttente),
    ).resolves.toEqual({ signature: "sig", slot: 42, aboutie: true, erreur: null });
  });

  /**
   * Une transaction en echec EST confirmee : elle a bien ete incluse, elle a
   * simplement echoue a l'execution. Lever une exception ferait passer une
   * regle appliquee pour une panne.
   */
  it("rend l'echec on-chain sans lever", async () => {
    const l = lecteur({
      slot: 43,
      err: { InstructionError: [0, { Custom: 6000 }] },
      confirmationStatus: "finalized",
    });
    const r = await attendreConfirmation(l as never, "sig", sansAttente);
    expect(r.aboutie).toBe(false);
    expect(r.erreur).toContain("InstructionError");
  });

  it("ne se contente pas d'un statut traite", async () => {
    const l = lecteur(
      { slot: 1, err: null, confirmationStatus: "processed" },
      { slot: 2, err: null, confirmationStatus: "confirmed" },
    );
    const r = await attendreConfirmation(l as never, "sig", sansAttente);
    expect(r.slot).toBe(2);
  });

  it("renonce en disant que l'empreinte a pu expirer", async () => {
    const l = { getSignatureStatuses: vi.fn(async () => ({ value: [null] }) as never) };
    await expect(
      attendreConfirmation(l as never, "sig", { ...sansAttente, tentatives: 3 }),
    ).rejects.toThrow(/expire/);
    expect(l.getSignatureStatuses).toHaveBeenCalledTimes(3);
  });
});
