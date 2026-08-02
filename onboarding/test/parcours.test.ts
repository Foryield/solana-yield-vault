import { describe, expect, it, vi } from "vitest";
import { parcours, type Etapes } from "../src/parcours.js";

function etapes(surcharges: Partial<Etapes> = {}): {
  etapes: Etapes;
  journal: string[];
} {
  const journal: string[] = [];
  const base: Etapes = {
    provisionner: async (nom) => {
      journal.push(`provisionner:${nom}`);
      return { walletId: "wa-1", adresse: "Sol1" };
    },
    financer: async (adresse) => {
      journal.push(`financer:${adresse}`);
      return "sig-dotation";
    },
    enveloppe: async (deposant) => {
      journal.push(`enveloppe:${deposant}`);
      return "0xabc";
    },
    diffuser: async (walletId, hex) => {
      journal.push(`diffuser:${walletId}:${hex}`);
      return "sig-depot";
    },
    confirmer: async (signature) => {
      journal.push(`confirmer:${signature}`);
      return { signature, slot: 7, aboutie: true, erreur: null };
    },
  };
  return { etapes: { ...base, ...surcharges }, journal };
}

describe("parcours", () => {
  it("rend le resume complet, de l'identifiant au slot", async () => {
    const { etapes: e } = etapes();
    await expect(parcours("porteur@exemple.test", e)).resolves.toEqual({
      identifiant: "porteur@exemple.test",
      walletId: "wa-1",
      adresse: "Sol1",
      dotation: "sig-dotation",
      signature: "sig-depot",
      slot: 7,
      aboutie: true,
      erreur: null,
    });
  });

  /**
   * L'ORDRE EST LE SUJET. L'enveloppe porte une empreinte de bloc qui expire en
   * quelques dizaines de secondes : la construire avant la dotation ferait
   * echouer la chaine sur une transaction expiree, ce qui ressemble a une panne
   * du fournisseur alors que c'est une faute d'ordonnancement.
   */
  it("construit l'enveloppe APRES la dotation et juste avant la diffusion", async () => {
    const { etapes: e, journal } = etapes();
    await parcours("porteur", e);
    expect(journal).toEqual([
      "provisionner:porteur",
      "financer:Sol1",
      "enveloppe:Sol1",
      "diffuser:wa-1:0xabc",
      "confirmer:sig-depot",
    ]);
  });

  it("depose pour le portefeuille qui vient d'etre provisionne", async () => {
    const { etapes: e, journal } = etapes({
      provisionner: async () => ({ walletId: "wa-9", adresse: "Sol9" }),
    });
    await parcours("porteur", e);
    expect(journal).toContain("financer:Sol9");
    expect(journal).toContain("enveloppe:Sol9");
    expect(journal).toContain("diffuser:wa-9:0xabc");
  });

  /**
   * Un depot refuse n'est pas une panne : la chaine a tenu de bout en bout.
   * Le resume sort quand meme, et c'est l'appelant qui decide du code de
   * sortie.
   */
  it("rend une inclusion en echec plutot que de lever", async () => {
    const { etapes: e } = etapes({
      confirmer: async (signature) => ({
        signature,
        slot: 8,
        aboutie: false,
        erreur: '{"InstructionError":[0,{"Custom":6000}]}',
      }),
    });
    const resume = await parcours("porteur", e);
    expect(resume.aboutie).toBe(false);
    expect(resume.erreur).toContain("Custom");
  });

  it("s'arrete a la premiere etape qui echoue", async () => {
    const suite = vi.fn();
    const { etapes: e } = etapes({
      financer: async () => {
        throw new Error("tresorerie a sec");
      },
      enveloppe: suite,
    });
    await expect(parcours("porteur", e)).rejects.toThrow(/tresorerie/);
    expect(suite).not.toHaveBeenCalled();
  });
});
