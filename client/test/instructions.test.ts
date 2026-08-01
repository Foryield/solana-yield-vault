import { describe, expect, it } from "vitest";
import { AnchorProvider } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import vaultFixture from "./fixtures/vault-addresses.json" with { type: "json" };
import hookFixture from "./fixtures/hook-addresses.json" with { type: "json" };
import { hookProgram, idls, vaultProgram } from "../src/programs.js";
import {
  instructionDeposit,
  instructionInitialize,
  instructionSetPaused,
  instructionWithdraw,
} from "../src/vault.js";
import {
  comptesPourTransfert,
  instructionAttacher,
  instructionAutoriser,
  instructionRevoquer,
  instructionTransfert,
} from "../src/hook.js";

/**
 * Ces tests ne touchent pas le reseau. Ils verifient que la composition rend
 * les comptes ATTENDUS PAR L'IDL, dans l'ordre exact.
 *
 * L'ordre compte autant que le contenu : un compte deplace d'un rang produit
 * une erreur de contrainte a l'execution, dont le message ne nomme jamais le
 * compte fautif. C'est le meme genre de defaut opaque que la derivation
 * d'adresses, et il merite le meme genre de garde.
 */

const SPL_TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

/** Fournisseur inerte : rien n'est signe ni envoye, seule la composition est testee. */
function fournisseur(): AnchorProvider {
  const connection = new Connection("http://127.0.0.1:8899", "processed");
  const portefeuille = {
    publicKey: Keypair.generate().publicKey,
    signTransaction: async <T>(t: T) => t,
    signAllTransactions: async <T>(t: T[]) => t,
  };
  return new AnchorProvider(connection, portefeuille as never, {});
}

/** Noms des comptes declares par l'IDL pour une instruction. */
interface IdlLeger {
  instructions: { name: string; accounts: { name: string }[] }[];
}

function comptesAttendus(idl: unknown, nom: string): string[] {
  const ix = (idl as IdlLeger).instructions.find((i) => i.name === nom);
  if (!ix) throw new Error(`instruction absente de l'IDL : ${nom}`);
  return ix.accounts.map((a) => a.name);
}

const vaultProgramId = new PublicKey(vaultFixture.programId);
const hookProgramId = new PublicKey(hookFixture.programId);
const depositMint = new PublicKey(vaultFixture.depositMint);

function ctxCoffre() {
  return {
    program: vaultProgram(vaultProgramId, fournisseur()),
    depositMint,
    depositTokenProgram: SPL_TOKEN,
  };
}

function ctxHook() {
  return { program: hookProgram(hookProgramId, fournisseur()), mint: depositMint };
}

describe("l'identifiant de programme est obligatoire", () => {
  it("n'est pas lu depuis l'IDL, qui n'en porte pas", () => {
    // Si un jour l'IDL recommence a porter une adresse, ce test le dira : la
    // remettre reintroduirait une valeur dependante de la machine de build.
    expect("address" in idls.vault).toBe(false);
    expect("address" in idls.hook).toBe(false);
  });

  it("est celui qu'on passe, pas un autre", () => {
    expect(ctxCoffre().program.programId.toBase58()).toBe(vaultFixture.programId);
    expect(ctxHook().program.programId.toBase58()).toBe(hookFixture.programId);
  });
});

describe("instructions du coffre", () => {
  const admin = Keypair.generate().publicKey;
  const porteur = Keypair.generate().publicKey;
  const actifs = Keypair.generate().publicKey;
  const parts = Keypair.generate().publicKey;

  it("initialize expose les comptes de l'IDL dans l'ordre", async () => {
    const ix = await instructionInitialize(ctxCoffre(), admin, hookProgramId);
    expect(ix.keys.length).toBe(comptesAttendus(idls.vault, "initialize").length);
    expect(ix.programId.toBase58()).toBe(vaultFixture.programId);
    // Le coffre et ses comptes derives doivent etre ceux de la fixture.
    const cles = ix.keys.map((k) => k.pubkey.toBase58());
    expect(cles).toContain(vaultFixture.vault);
    expect(cles).toContain(vaultFixture.sharesMint);
    expect(cles).toContain(vaultFixture.vaultAssets);
    expect(cles).toContain(vaultFixture.deadShares);
  });

  it("deposit joint le compte des parts mortes, initialize compris", async () => {
    const ix = await instructionDeposit(ctxCoffre(), porteur, actifs, parts, 1_000n);
    expect(ix.keys.length).toBe(comptesAttendus(idls.vault, "deposit").length);
    expect(ix.keys.map((k) => k.pubkey.toBase58())).toContain(vaultFixture.deadShares);
  });

  it("withdraw NE joint PAS les parts mortes", async () => {
    // Elles ne sont jamais servies : aucun chemin du programme ne les sort de
    // leur compte, et les joindre laisserait croire le contraire.
    const ix = await instructionWithdraw(ctxCoffre(), porteur, actifs, parts, 500n);
    expect(ix.keys.length).toBe(comptesAttendus(idls.vault, "withdraw").length);
    expect(ix.keys.map((k) => k.pubkey.toBase58())).not.toContain(
      vaultFixture.deadShares,
    );
  });

  it("setPaused ne touche que l'administrateur et le coffre", async () => {
    const ix = await instructionSetPaused(ctxCoffre(), admin, true);
    expect(ix.keys.length).toBe(comptesAttendus(idls.vault, "set_paused").length);
  });
});

describe("instructions du module de conformite", () => {
  const payeur = Keypair.generate().publicKey;
  const autorite = Keypair.generate().publicKey;
  const porteur = new PublicKey(hookFixture.holder);

  it("attacher expose les comptes de l'IDL", async () => {
    const ix = await instructionAttacher(ctxHook(), payeur, autorite);
    expect(ix.keys.length).toBe(comptesAttendus(idls.hook, "initialize").length);
    const cles = ix.keys.map((k) => k.pubkey.toBase58());
    expect(cles).toContain(hookFixture.config);
    expect(cles).toContain(hookFixture.extraAccountMetas);
  });

  it("l'autorite signe son propre engagement", async () => {
    const ix = await instructionAttacher(ctxHook(), payeur, autorite);
    const meta = ix.keys.find((k) => k.pubkey.equals(autorite));
    expect(meta?.isSigner).toBe(true);
  });

  it("autoriser vise l'entree derivee du porteur", async () => {
    const ix = await instructionAutoriser(ctxHook(), payeur, autorite, porteur);
    expect(ix.keys.map((k) => k.pubkey.toBase58())).toContain(
      hookFixture.allowlistEntry,
    );
  });

  it("revoquer rend le depot a l'autorite, donc la declare modifiable", async () => {
    const ix = await instructionRevoquer(ctxHook(), autorite, porteur);
    const meta = ix.keys.find((k) => k.pubkey.equals(autorite));
    expect(meta?.isWritable).toBe(true);
  });
});

describe("comptes supplementaires d'un transfert de parts", () => {
  it("rend le programme, la liste et l'entree du destinataire, dans cet ordre", () => {
    const porteur = new PublicKey(hookFixture.holder);
    const comptes = comptesPourTransfert(ctxHook(), porteur).map((p) => p.toBase58());
    expect(comptes).toEqual([
      hookFixture.programId,
      hookFixture.extraAccountMetas,
      hookFixture.allowlistEntry,
    ]);
  });
});

describe("transfert de parts", () => {
  const source = Keypair.generate().publicKey;
  const destination = Keypair.generate().publicKey;
  const emetteur = Keypair.generate().publicKey;
  const destinataire = new PublicKey(hookFixture.holder);

  function transfert() {
    return instructionTransfert(
      ctxHook(),
      source,
      destination,
      emetteur,
      destinataire,
      4_000n,
      6,
    );
  }

  it("est un transfert VERIFIE, sur Token-2022", () => {
    // Le transfert herite, qui ne passe pas le mint, est rejete par Token-2022
    // faute de savoir quel hook appeler : composer autre chose que
    // `transfer_checked` rendrait l'instruction inutilisable.
    expect(transfert().programId.toBase58()).toBe(TOKEN_2022.toBase58());
    expect(transfert().keys.slice(0, 4).map((k) => k.pubkey.toBase58())).toEqual([
      source.toBase58(),
      hookFixture.mint,
      destination.toBase58(),
      emetteur.toBase58(),
    ]);
  });

  it("joint les trois comptes du hook APRES ceux du transfert", () => {
    // Token-2022 resout la liste contre les comptes supplementaires par leur
    // RANG. Un compte glisse d'une place produit une erreur qui ne nomme
    // jamais le compte fautif.
    const cles = transfert().keys;
    expect(cles.length).toBe(7);
    expect(cles.slice(4).map((k) => k.pubkey.toBase58())).toEqual([
      hookFixture.programId,
      hookFixture.extraAccountMetas,
      hookFixture.allowlistEntry,
    ]);
    expect(cles.slice(4).every((k) => !k.isSigner && !k.isWritable)).toBe(true);
  });

  it("ne fait signer que l'emetteur", () => {
    // Le destinataire ne signe rien : c'est ce qui permet d'envoyer des parts a
    // un porteur dont on n'a ni la cle ni le SOL.
    const signataires = transfert()
      .keys.filter((k) => k.isSigner)
      .map((k) => k.pubkey.toBase58());
    expect(signataires).toEqual([emetteur.toBase58()]);
  });
});
