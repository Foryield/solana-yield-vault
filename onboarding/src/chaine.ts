import { readFileSync } from "node:fs";
import { AnchorProvider, type Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import {
  vaultProgram,
  type YieldVault,
} from "@foryield/solana-yield-vault-client";
import { exigeDevnet, type Config } from "./config.js";

/**
 * Le peu de reseau dont les commandes ont besoin, en un seul endroit.
 *
 * Rien ici n'est propre au provisionnement : ce sont les gestes que la ligne de
 * commande d'administration fait deja, repris sous les memes regles. En
 * particulier, le programme proprietaire d'un mint est LU on-chain et jamais
 * suppose.
 */

/** Connexion verifiee : la chaine au bout du fil est devnet, ou rien ne se passe. */
export async function connexion(config: Config): Promise<Connection> {
  const connection = new Connection(config.rpcUrl, "confirmed");
  await exigeDevnet(connection);
  return connection;
}

export function chargerCle(chemin: string): Keypair {
  const brut = JSON.parse(
    readFileSync(chemin.replace(/^~/, process.env["HOME"] ?? "~"), "utf8"),
  );
  return Keypair.fromSecretKey(Uint8Array.from(brut));
}

/**
 * Fournisseur inerte : rien n'est signe ici. Anchor exige un portefeuille pour
 * construire un client, alors que composer une instruction n'en utilise aucun.
 * C'est ce qui permet de fabriquer une enveloppe pour une adresse dont nous ne
 * tenons pas la cle, ce qui est tout l'objet de ce paquet.
 */
export function fournisseurInerte(connection: Connection): AnchorProvider {
  const inerte = {
    publicKey: PublicKey.default,
    signTransaction: async <T>(t: T) => t,
    signAllTransactions: async <T>(t: T[]) => t,
  };
  return new AnchorProvider(connection, inerte as never, {
    commitment: "confirmed",
  });
}

export function programmeDuCoffre(
  config: Config,
  connection: Connection,
): Program<YieldVault> {
  return vaultProgram(config.vaultProgramId, fournisseurInerte(connection));
}

export async function programmeDuMint(
  connection: Connection,
  mint: PublicKey,
): Promise<PublicKey> {
  const compte = await connection.getAccountInfo(mint);
  if (!compte) throw new Error(`mint introuvable sur ce reseau : ${mint.toBase58()}`);
  return compte.owner;
}

export async function decimalesDuMint(
  connection: Connection,
  mint: PublicKey,
  programme: PublicKey,
): Promise<number> {
  return (await getMint(connection, mint, "confirmed", programme)).decimals;
}

export async function envoyer(
  connection: Connection,
  cle: Keypair,
  instructions: TransactionInstruction[],
): Promise<string> {
  const tx = new Transaction().add(...instructions);
  return sendAndConfirmTransaction(connection, tx, [cle], {
    commitment: "confirmed",
  });
}
