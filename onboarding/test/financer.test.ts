import { describe, expect, it } from "vitest";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  LAMPORTS_PAR_DEFAUT,
  comptesDuPorteur,
  instructionsDeDotation,
} from "../src/financer.js";

const PAYEUR = new PublicKey("7DsCEFjRBQkWiEPE739QuY4CiRWXQEZbeB1F5RGRsuBP");
const BENEFICIAIRE = new PublicKey("Dz7mzmQS9YDvDMu9faWms41rfcyUM3vZDRXu9ZNhLgKr");
const ACTIF = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const PARTS = new PublicKey("BeBQQqjuUFU1qjJayMg46CWuaKw7oTJ5R4UfoVLVKohL");

const demande = {
  payeur: PAYEUR,
  beneficiaire: BENEFICIAIRE,
  depositMint: ACTIF,
  programmeDeLActif: TOKEN_PROGRAM_ID,
  sharesMint: PARTS,
  decimalesDeLActif: 6,
  lamports: LAMPORTS_PAR_DEFAUT,
  actif: 500_000n,
};

describe("comptesDuPorteur", () => {
  /**
   * Les deux comptes ne vivent pas sous le meme programme de jeton : l'actif
   * est du SPL classique, les parts sont du Token-2022. Les confondre derive
   * une adresse qui n'existe pas, et l'erreur ne se voit qu'a l'execution.
   */
  it("derive chaque compte sous son propre programme de jeton", () => {
    const c = comptesDuPorteur(BENEFICIAIRE, ACTIF, TOKEN_PROGRAM_ID, PARTS);
    expect(c.actif.toBase58()).toBe(
      getAssociatedTokenAddressSync(ACTIF, BENEFICIAIRE, false, TOKEN_PROGRAM_ID).toBase58(),
    );
    expect(c.parts.toBase58()).toBe(
      getAssociatedTokenAddressSync(
        PARTS, BENEFICIAIRE, false, TOKEN_2022_PROGRAM_ID,
      ).toBase58(),
    );
    expect(c.actif.toBase58()).not.toBe(c.parts.toBase58());
  });
});

describe("instructionsDeDotation", () => {
  it("dote, ouvre le compte d'actif, transfere, puis ouvre le compte de parts", () => {
    const ix = instructionsDeDotation(demande);
    expect(ix).toHaveLength(4);
    expect(ix[0]!.programId.toBase58()).toBe(SystemProgram.programId.toBase58());
    expect(ix[1]!.programId.toBase58()).toBe(ASSOCIATED_TOKEN_PROGRAM_ID.toBase58());
    expect(ix[2]!.programId.toBase58()).toBe(TOKEN_PROGRAM_ID.toBase58());
    expect(ix[3]!.programId.toBase58()).toBe(ASSOCIATED_TOKEN_PROGRAM_ID.toBase58());
  });

  /**
   * L'ordre n'est pas cosmetique : le transfert d'actif suppose que le compte
   * de destination existe. L'inverser echouerait a l'execution, et seulement
   * la.
   */
  it("ouvre le compte d'actif AVANT d'y transferer", () => {
    const ix = instructionsDeDotation(demande);
    const destination = comptesDuPorteur(
      BENEFICIAIRE, ACTIF, TOKEN_PROGRAM_ID, PARTS,
    ).actif.toBase58();
    const ouvre = ix[1]!.keys.some((k) => k.pubkey.toBase58() === destination);
    const transfere = ix[2]!.keys.some((k) => k.pubkey.toBase58() === destination);
    expect(ouvre).toBe(true);
    expect(transfere).toBe(true);
  });

  it("ouvre le compte de parts sous Token-2022, aux frais du payeur", () => {
    const ix = instructionsDeDotation(demande)[3]!;
    const comptes = ix.keys.map((k) => k.pubkey.toBase58());
    expect(comptes).toContain(TOKEN_2022_PROGRAM_ID.toBase58());
    expect(comptes).toContain(PARTS.toBase58());
    // Le payeur signe et paie la location : le beneficiaire n'a pas encore de
    // SOL au moment ou cette instruction s'execute.
    expect(ix.keys[0]!.pubkey.toBase58()).toBe(PAYEUR.toBase58());
    expect(ix.keys[0]!.isSigner).toBe(true);
  });

  /**
   * Le transfert est VERIFIE : il porte le mint et ses decimales. Un transfert
   * simple deplacerait un montant mal compte sans rien dire si le mint n'etait
   * pas celui qu'on croit.
   */
  it("passe par un transfert verifie, portant le mint", () => {
    const ix = instructionsDeDotation(demande)[2]!;
    expect(ix.keys.map((k) => k.pubkey.toBase58())).toContain(ACTIF.toBase58());
    // Discriminateur 12 de SPL Token : TransferChecked.
    expect(ix.data[0]).toBe(12);
    expect(ix.data[ix.data.length - 1]).toBe(6);
  });

  it("refuse une dotation nulle plutot que d'envoyer une transaction inutile", () => {
    expect(() => instructionsDeDotation({ ...demande, lamports: 0n })).toThrow(/SOL/);
    expect(() => instructionsDeDotation({ ...demande, actif: 0n })).toThrow(/actif/);
  });
});
