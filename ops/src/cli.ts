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
  getMint,
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
  instructionTransfert,
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

  /**
   * Transfere des parts a un autre porteur. GESTE DE PORTEUR, meme reserve que
   * le depot et le retrait.
   *
   * C'est la SEULE surface ou le controle d'eligibilite se voit : une frappe et
   * une destruction ne sont pas des transferts, donc ni le depot ni le retrait
   * n'invoquent le hook.
   *
   * Le compte de parts du destinataire est cree dans une transaction SEPAREE.
   * Le grouper avec le transfert ferait disparaitre le compte avec le refus, et
   * on ne pourrait plus montrer qu'un destinataire non autorise a bien un
   * compte, reste a zero.
   */
  async transferer(config, [mintStr, destinataireStr, partsStr]) {
    if (!mintStr || !destinataireStr || !partsStr) {
      throw new Error("usage : transferer <mint-actif> <destinataire> <parts>");
    }
    const { connection, cle, provider } = contexte(config);
    const depositMint = new PublicKey(mintStr);
    const compteMint = await connection.getAccountInfo(depositMint);
    if (!compteMint) throw new Error(`mint introuvable : ${mintStr}`);
    const destinataire = new PublicKey(destinataireStr);

    const ctx = {
      program: vaultProgram(config.vaultProgramId, provider),
      depositMint,
      depositTokenProgram: compteMint.owner,
    };
    const a = adressesDuCoffre(ctx);

    // Les decimales sont LUES sur le mint des parts. La composition les exige
    // en argument pour rester hors ligne ; les supposer egales a celles de
    // l'actif serait une coincidence, pas une regle.
    const { decimals } = await getMint(
      connection, a.sharesMint, "confirmed", TOKEN_2022_PROGRAM_ID,
    );

    const source = getAssociatedTokenAddressSync(
      a.sharesMint, cle.publicKey, false, TOKEN_2022_PROGRAM_ID,
    );
    const destination = getAssociatedTokenAddressSync(
      a.sharesMint, destinataire, false, TOKEN_2022_PROGRAM_ID,
    );

    let creation: string | null = null;
    if ((await connection.getAccountInfo(destination)) === null) {
      creation = await envoyer(connection, cle, [
        createAssociatedTokenAccountIdempotentInstruction(
          cle.publicKey, destination, destinataire, a.sharesMint, TOKEN_2022_PROGRAM_ID,
        ),
      ]);
      // Annoncee des qu'elle est acquise : si le transfert est ensuite refuse,
      // la ligne JSON ne sera jamais imprimee et un compte aura pourtant ete
      // cree et paye. Un effet non trace est un effet perdu.
      console.error(`compte de parts du destinataire cree : ${creation}`);
    }

    const hookCtx = {
      program: hookProgram(config.hookProgramId, provider),
      mint: a.sharesMint,
    };
    const ix = instructionTransfert(
      hookCtx, source, destination, cle.publicKey, destinataire,
      BigInt(partsStr), decimals,
    );
    const signature = await envoyer(connection, cle, [ix]);
    return {
      sharesMint: a.sharesMint.toBase58(),
      destinataire: destinataireStr,
      parts: partsStr,
      comptes: { source: source.toBase58(), destination: destination.toBase58() },
      creationDuCompte: creation,
      soldes: {
        source: await lireSolde(connection, source, TOKEN_2022_PROGRAM_ID),
        destination: await lireSolde(connection, destination, TOKEN_2022_PROGRAM_ID),
      },
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

/** Solde d'un compte de jeton. Un compte absent vaut zero, pas une erreur. */
async function lireSolde(
  connection: Connection,
  compte: PublicKey,
  programme: PublicKey,
): Promise<string> {
  try {
    return (await getAccount(connection, compte, "confirmed", programme)).amount.toString();
  } catch {
    return "0";
  }
}

/** Photo des soldes qui comptent, apres une operation. */
async function soldes(
  connection: Connection,
  ctx: { depositMint: PublicKey; program: { programId: PublicKey } },
  parts: PublicKey,
  actifs: PublicKey,
  programmeActif: PublicKey,
): Promise<Record<string, string>> {
  const a = adressesDuCoffre(ctx as never);
  return {
    partsDuPorteur: await lireSolde(connection, parts, TOKEN_2022_PROGRAM_ID),
    actifDuPorteur: await lireSolde(connection, actifs, programmeActif),
    actifDuCoffre: await lireSolde(connection, a.vaultAssets, programmeActif),
    partsMortes: await lireSolde(connection, a.deadShares, TOKEN_2022_PROGRAM_ID),
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
    const message = e instanceof Error ? e.message : String(e);
    console.error(message);
    // LES JOURNAUX DU PROGRAMME, quand le message ne les porte pas deja. Un
    // refus dont on ne lit pas le code ne prouve rien : une regle appliquee et
    // un accident de composition echouent de la meme facon vu du dehors. Un
    // echec de simulation les joint ; un echec constate apres envoi, non.
    const journaux = (e as { logs?: string[] }).logs;
    if (journaux?.length && !message.includes(journaux[0]!)) {
      console.error(journaux.join("\n"));
    }
  }
  process.exit(1);
});
