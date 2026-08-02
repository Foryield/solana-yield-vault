import type { Program } from "@coral-xyz/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  adressesDuCoffre,
  instructionDeposit,
  type YieldVault,
} from "@foryield/solana-yield-vault-client";
import { comptesDuPorteur, type ComptesDuPorteur } from "./financer.js";

/**
 * Troisieme brique : la transaction de depot, NON SIGNEE.
 *
 * C'est la piece que le fournisseur de garde ne peut pas fabriquer : elle
 * connait nos programmes, la derivation de nos adresses et notre instruction de
 * depot. Le fournisseur, lui, ne sait que signer et diffuser des octets.
 *
 * Rien ici n'appelle le reseau. La composition est hors ligne dans la
 * bibliotheque partagee, et l'empreinte de bloc est passee en argument plutot
 * que lue : c'est ce qui rend cette brique testable sans reseau, et c'est aussi
 * ce qui laisse l'appelant la construire au DERNIER moment, juste avant la
 * diffusion.
 */

export interface Empreinte {
  blockhash: string;
  lastValidBlockHeight: number;
}

export interface EnveloppeDemandee {
  program: Program<YieldVault>;
  depositMint: PublicKey;
  /** Programme proprietaire de l'actif. A lire on-chain, jamais a supposer. */
  programmeDeLActif: PublicKey;
  deposant: PublicKey;
  montant: bigint;
  empreinte: Empreinte;
}

export interface EnveloppeConstruite {
  /** Transaction serialisee, prefixee `0x`, telle que la garde l'attend. */
  hex: string;
  sharesMint: string;
  comptes: { actif: string; parts: string };
}

export async function enveloppeDeDepot(
  d: EnveloppeDemandee,
): Promise<EnveloppeConstruite> {
  if (d.montant <= 0n) throw new Error("le montant du depot doit etre positif");

  const ctx = {
    program: d.program,
    depositMint: d.depositMint,
    depositTokenProgram: d.programmeDeLActif,
  };
  const a = adressesDuCoffre(ctx);
  const comptes: ComptesDuPorteur = comptesDuPorteur(
    d.deposant,
    d.depositMint,
    d.programmeDeLActif,
    a.sharesMint,
  );

  // Une seule instruction. Les deux comptes de jeton du deposant existent
  // deja : la brique de dotation les a ouverts, aux frais de la tresorerie.
  const ix = await instructionDeposit(
    ctx,
    d.deposant,
    comptes.actif,
    comptes.parts,
    d.montant,
  );

  const tx = new Transaction({
    feePayer: d.deposant,
    blockhash: d.empreinte.blockhash,
    lastValidBlockHeight: d.empreinte.lastValidBlockHeight,
  }).add(ix);

  // Serialisation d'une transaction SANS SIGNATURE : le format de fil reserve
  // l'emplacement de la signature, que le fournisseur remplira. Refuser la
  // verification est donc necessaire ici, et seulement ici.
  const brut = tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });

  return {
    hex: `0x${brut.toString("hex")}`,
    sharesMint: a.sharesMint.toBase58(),
    comptes: {
      actif: comptes.actif.toBase58(),
      parts: comptes.parts.toBase58(),
    },
  };
}
