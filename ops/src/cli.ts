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
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  hookProgram,
  vaultProgram,
  instructionAttacher,
  instructionAutoriser,
  instructionRevoquer,
  instructionInitialize,
  instructionDeposit,
  instructionWithdraw,
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

  /**
   * Depose sur un coffre. GESTE DE PORTEUR, pas d'administration : il figure
   * ici parce que c'est notre seul client pour l'instant, et parce que la
   * preuve devnet en a besoin. La demonstration web le fera avec un
   * portefeuille, sur la meme bibliotheque de composition.
   *
   * Le compte de parts du deposant est cree si besoin, en compte associe : le
   * programme dedie calcule sa taille depuis les extensions IMPOSEES par le
   * mint, ce qui evite de la calculer nous-memes et de se tromper.
   */
  async deposer(config, [mintStr, montantStr]) {
    if (!mintStr || !montantStr) throw new Error("usage : deposer <mint-actif> <montant>");
    const { connection, cle, provider } = contexte(config);
    const depositMint = new PublicKey(mintStr);
    const compteMint = await connection.getAccountInfo(depositMint);
    if (!compteMint) throw new Error(`mint introuvable : ${mintStr}`);

    const ctx = {
      program: vaultProgram(config.vaultProgramId, provider),
      depositMint,
      depositTokenProgram: compteMint.owner,
    };
    const a = adressesDuCoffre(ctx);
    const actifs = getAssociatedTokenAddressSync(
      depositMint, cle.publicKey, false, compteMint.owner,
    );
    const parts = getAssociatedTokenAddressSync(
      a.sharesMint, cle.publicKey, false, TOKEN_2022_PROGRAM_ID,
    );
    const creerParts = createAssociatedTokenAccountIdempotentInstruction(
      cle.publicKey, parts, cle.publicKey, a.sharesMint, TOKEN_2022_PROGRAM_ID,
    );
    const ix = await instructionDeposit(
      ctx, cle.publicKey, actifs, parts, BigInt(montantStr),
    );
    const signature = await envoyer(connection, cle, [creerParts, ix]);
    return {
      depositMint: mintStr,
      montant: montantStr,
      comptesDuPorteur: { actifs: actifs.toBase58(), parts: parts.toBase58() },
      soldes: await soldes(connection, ctx, parts, actifs, compteMint.owner),
      signature,
    };
  },

  /** Retire. Geste de porteur egalement, meme reserve que le depot. */
  async retirer(config, [mintStr, partsStr]) {
    if (!mintStr || !partsStr) throw new Error("usage : retirer <mint-actif> <parts>");
    const { connection, cle, provider } = contexte(config);
    const depositMint = new PublicKey(mintStr);
    const compteMint = await connection.getAccountInfo(depositMint);
    if (!compteMint) throw new Error(`mint introuvable : ${mintStr}`);

    const ctx = {
      program: vaultProgram(config.vaultProgramId, provider),
      depositMint,
      depositTokenProgram: compteMint.owner,
    };
    const a = adressesDuCoffre(ctx);
    const actifs = getAssociatedTokenAddressSync(
      depositMint, cle.publicKey, false, compteMint.owner,
    );
    const parts = getAssociatedTokenAddressSync(
      a.sharesMint, cle.publicKey, false, TOKEN_2022_PROGRAM_ID,
    );
    const ix = await instructionWithdraw(
      ctx, cle.publicKey, actifs, parts, BigInt(partsStr),
    );
    const signature = await envoyer(connection, cle, [ix]);
    return {
      depositMint: mintStr,
      partsDetruites: partsStr,
      soldes: await soldes(connection, ctx, parts, actifs, compteMint.owner),
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

/** Photo des soldes qui comptent, apres une operation. */
async function soldes(
  connection: Connection,
  ctx: { depositMint: PublicKey; program: { programId: PublicKey } },
  parts: PublicKey,
  actifs: PublicKey,
  programmeActif: PublicKey,
): Promise<Record<string, string>> {
  const a = adressesDuCoffre(ctx as never);
  const lire = async (compte: PublicKey, programme: PublicKey) => {
    try {
      return (await getAccount(connection, compte, "confirmed", programme)).amount.toString();
    } catch {
      return "0";
    }
  };
  return {
    partsDuPorteur: await lire(parts, TOKEN_2022_PROGRAM_ID),
    actifDuPorteur: await lire(actifs, programmeActif),
    actifDuCoffre: await lire(a.vaultAssets, programmeActif),
    partsMortes: await lire(a.deadShares, TOKEN_2022_PROGRAM_ID),
  };
}

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
