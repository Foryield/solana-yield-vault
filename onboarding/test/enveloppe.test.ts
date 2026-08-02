import { describe, expect, it } from "vitest";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { enveloppeDeDepot } from "../src/enveloppe.js";
import { fournisseurInerte } from "../src/chaine.js";
import { vaultProgram } from "@foryield/solana-yield-vault-client";

/**
 * Aucun reseau ici. Construire une connexion n'ouvre rien, et la composition
 * d'instructions est hors ligne par construction dans la bibliotheque
 * partagee : c'est ce qui permet de fabriquer une enveloppe pour une adresse
 * dont nous ne tenons pas la cle.
 */

const VAULT = new PublicKey("2bkjZG8njXHQ1tdj5aRSiwjjndX1qEvjFYzBYJQjNysw");
const ACTIF = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const DEPOSANT = new PublicKey("Dz7mzmQS9YDvDMu9faWms41rfcyUM3vZDRXu9ZNhLgKr");

// Empreinte figee : une valeur base58 valide de 32 octets suffit, la
// serialisation ne l'interprete pas.
const EMPREINTE = {
  blockhash: "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi",
  lastValidBlockHeight: 1,
};

function demande(montant = 500_000n) {
  const connection = new Connection("http://127.0.0.1:8899", "confirmed");
  return {
    program: vaultProgram(VAULT, fournisseurInerte(connection)),
    depositMint: ACTIF,
    programmeDeLActif: TOKEN_PROGRAM_ID,
    deposant: DEPOSANT,
    montant,
    empreinte: EMPREINTE,
  };
}

describe("enveloppeDeDepot", () => {
  it("rend une transaction relisible, prefixee 0x", async () => {
    const { hex } = await enveloppeDeDepot(demande());
    expect(hex.startsWith("0x")).toBe(true);
    expect(() =>
      Transaction.from(Buffer.from(hex.slice(2), "hex")),
    ).not.toThrow();
  });

  /**
   * LE POINT QUI PORTE TOUT : le deposant paie ses propres frais, et c'est
   * pourquoi la brique de dotation lui envoie du SOL avant. Un payeur de frais
   * different ferait signer quelqu'un d'autre, et le fournisseur de garde ne
   * signe que pour son propre portefeuille.
   */
  it("designe le deposant comme payeur de frais", async () => {
    const { hex } = await enveloppeDeDepot(demande());
    const tx = Transaction.from(Buffer.from(hex.slice(2), "hex"));
    expect(tx.feePayer?.toBase58()).toBe(DEPOSANT.toBase58());
    expect(tx.recentBlockhash).toBe(EMPREINTE.blockhash);
  });

  /**
   * Une seule instruction : les deux comptes de jeton existent deja, ouverts
   * par la dotation. C'est ce qui reduit au minimum ce qui doit tenir dans la
   * fenetre de validite de l'empreinte de bloc.
   */
  it("ne porte que le depot, adresse au programme du coffre", async () => {
    const { hex } = await enveloppeDeDepot(demande());
    const tx = Transaction.from(Buffer.from(hex.slice(2), "hex"));
    expect(tx.instructions).toHaveLength(1);
    expect(tx.instructions[0]!.programId.toBase58()).toBe(VAULT.toBase58());
  });

  it("n'est pas signee, et attend une seule signature", async () => {
    const { hex } = await enveloppeDeDepot(demande());
    const tx = Transaction.from(Buffer.from(hex.slice(2), "hex"));
    expect(tx.signatures).toHaveLength(1);
    expect(tx.signatures[0]!.signature).toBeNull();
    expect(tx.signatures[0]!.publicKey.toBase58()).toBe(DEPOSANT.toBase58());
  });

  it("annonce les comptes du deposant et le mint des parts", async () => {
    const enveloppe = await enveloppeDeDepot(demande());
    expect(() => new PublicKey(enveloppe.sharesMint)).not.toThrow();
    expect(() => new PublicKey(enveloppe.comptes.actif)).not.toThrow();
    expect(() => new PublicKey(enveloppe.comptes.parts)).not.toThrow();
  });

  it("refuse un montant nul", async () => {
    await expect(enveloppeDeDepot(demande(0n))).rejects.toThrow(/positif/);
  });
});
