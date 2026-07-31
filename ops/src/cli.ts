import { readFileSync } from "node:fs";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  hookProgram,
  vaultProgram,
  instructionAttacher,
  instructionAutoriser,
  instructionRevoquer,
  instructionInitialize,
  adressesDuCoffre,
  adressesDuHook,
  adresseEntree,
  lireCoffre,
  estAutorise,
} from "@foryield/solana-yield-vault-client";
import { chargerConfig, ConfigError, type Config } from "./config.js";

/**
 * Administration du coffre et du module de conformite.
 *
 * Ce programme SIGNE avec une cle locale : il n'a rien a faire dans un
 * navigateur, et reciproquement la demonstration web n'a pas a connaitre ces
 * gestes. C'est la seule raison pour laquelle deux surfaces existent ; elles
 * partagent la meme bibliotheque de composition.
 *
 * Chaque commande imprime une ligne JSON sur la sortie standard et ses erreurs
 * sur la sortie d'erreur, pour etre appelable depuis n'importe quel dorsal.
 */

function chargerCle(chemin: string): Keypair {
  const brut = JSON.parse(readFileSync(chemin.replace(/^~/, process.env["HOME"] ?? "~"), "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(brut));
}

function contexte(config: Config) {
  const connection = new Connection(config.rpcUrl, "confirmed");
  const cle = chargerCle(config.keypairPath);
  const provider = new AnchorProvider(connection, new Wallet(cle), {
    commitment: "confirmed",
  });
  return { connection, cle, provider };
}

async function envoyer(
  connection: Connection,
  cle: Keypair,
  instructions: Awaited<ReturnType<typeof instructionAttacher>>[],
): Promise<string> {
  const tx = new Transaction().add(...instructions);
  return sendAndConfirmTransaction(connection, tx, [cle], {
    commitment: "confirmed",
  });
}

const commandes: Record<
  string,
  (config: Config, args: string[]) => Promise<unknown>
> = {
  /** Attache le hook a un mint : configuration + liste de comptes supplementaires. */
  async attacher(config, [mintStr]) {
    if (!mintStr) throw new Error("usage : attacher <mint>");
    const { connection, cle, provider } = contexte(config);
    const mint = new PublicKey(mintStr);
    const ctx = { program: hookProgram(config.hookProgramId, provider), mint };
    const ix = await instructionAttacher(ctx, cle.publicKey, cle.publicKey);
    const signature = await envoyer(connection, cle, [ix]);
    return { mint: mintStr, ...adressesToBase58(adressesDuHook(ctx)), signature };
  },

  /** Autorise un porteur a RECEVOIR des parts. */
  async autoriser(config, [mintStr, porteurStr]) {
    if (!mintStr || !porteurStr) throw new Error("usage : autoriser <mint> <porteur>");
    const { connection, cle, provider } = contexte(config);
    const mint = new PublicKey(mintStr);
    const porteur = new PublicKey(porteurStr);
    const ctx = { program: hookProgram(config.hookProgramId, provider), mint };
    const ix = await instructionAutoriser(ctx, cle.publicKey, cle.publicKey, porteur);
    const signature = await envoyer(connection, cle, [ix]);
    return {
      mint: mintStr,
      porteur: porteurStr,
      entree: adresseEntree(ctx, porteur).toBase58(),
      signature,
    };
  },

  /** Retire l'autorisation. Le compte est ferme, son depot revient a l'autorite. */
  async revoquer(config, [mintStr, porteurStr]) {
    if (!mintStr || !porteurStr) throw new Error("usage : revoquer <mint> <porteur>");
    const { connection, cle, provider } = contexte(config);
    const mint = new PublicKey(mintStr);
    const porteur = new PublicKey(porteurStr);
    const ctx = { program: hookProgram(config.hookProgramId, provider), mint };
    const ix = await instructionRevoquer(ctx, cle.publicKey, porteur);
    const signature = await envoyer(connection, cle, [ix]);
    return { mint: mintStr, porteur: porteurStr, signature };
  },

  /**
   * Cree un coffre sur un actif. Le programme de jeton de l'actif est LU
   * on-chain plutot que suppose : USDC et EURC devnet sont du SPL classique,
   * mais rien ne l'impose a un autre actif.
   */
  async initialiser(config, [mintStr]) {
    if (!mintStr) throw new Error("usage : initialiser <mint-de-l-actif>");
    const { connection, cle, provider } = contexte(config);
    const depositMint = new PublicKey(mintStr);
    const compte = await connection.getAccountInfo(depositMint);
    if (!compte) throw new Error(`mint introuvable sur ce reseau : ${mintStr}`);

    const ctx = {
      program: vaultProgram(config.vaultProgramId, provider),
      depositMint,
      depositTokenProgram: compte.owner,
    };
    const ix = await instructionInitialize(ctx, cle.publicKey, config.hookProgramId);
    const signature = await envoyer(connection, cle, [ix]);
    return {
      depositMint: mintStr,
      depositTokenProgram: compte.owner.toBase58(),
      ...adressesToBase58(adressesDuCoffre(ctx)),
      signature,
    };
  },

  /** Lit l'etat d'un coffre et, si un porteur est donne, son eligibilite. */
  async etat(config, [mintStr, porteurStr]) {
    if (!mintStr) throw new Error("usage : etat <mint-de-l-actif> [porteur]");
    const { connection, provider } = contexte(config);
    const depositMint = new PublicKey(mintStr);
    const compte = await connection.getAccountInfo(depositMint);
    if (!compte) throw new Error(`mint introuvable sur ce reseau : ${mintStr}`);

    const ctx = {
      program: vaultProgram(config.vaultProgramId, provider),
      depositMint,
      depositTokenProgram: compte.owner,
    };
    const etat = await lireCoffre(ctx);
    const sortie: Record<string, unknown> = {
      depositMint: mintStr,
      ...adressesToBase58(adressesDuCoffre(ctx)),
      initialise: etat !== null,
      ...(etat
        ? {
            admin: etat.admin.toBase58(),
            hookProgram: etat.hookProgram.toBase58(),
            suspendu: etat.paused,
          }
        : {}),
    };

    if (porteurStr && etat) {
      const hookCtx = {
        program: hookProgram(config.hookProgramId, provider),
        mint: etat.sharesMint,
      };
      sortie["porteur"] = porteurStr;
      sortie["autorise"] = await estAutorise(hookCtx, new PublicKey(porteurStr));
    }
    return sortie;
  },
};

function adressesToBase58(a: object): Record<string, string> {
  return Object.fromEntries(
    Object.entries(a).map(([k, v]) => [k, (v as PublicKey).toBase58()]),
  );
}

async function main(): Promise<void> {
  const [commande, ...args] = process.argv.slice(2);
  if (!commande || !(commande in commandes)) {
    console.error(`commandes : ${Object.keys(commandes).join(", ")}`);
    process.exit(1);
  }
  const config = chargerConfig(process.env);
  const resultat = await commandes[commande]!(config, args);
  console.log(JSON.stringify(resultat));
}

main().catch((e) => {
  if (e instanceof ConfigError) {
    console.error(`configuration : ${e.message}`);
  } else {
    console.error(e instanceof Error ? e.message : String(e));
  }
  process.exit(1);
});
