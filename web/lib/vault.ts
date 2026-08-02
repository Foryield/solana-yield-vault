import { AnchorProvider } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import {
  adressesDuCoffre,
  estAutorise,
  hookProgram,
  idls,
  instructionDeposit,
  instructionTransfert,
  instructionWithdraw,
  lireCoffre,
  vaultProgram,
} from "@foryield/solana-yield-vault-client";
import type { Config } from "./config";

/**
 * Lectures on-chain et composition des trois gestes de la demonstration.
 *
 * Ce module ne connait NI React NI le portefeuille : il rend des instructions
 * et recoit une fonction d'envoi. C'est la meme frontiere que la bibliotheque
 * de composition pose (`client/src/vault.ts`), et c'est ce qui permet a la
 * ligne de commande et a cette page de partager le meme code de composition
 * tout en signant de deux facons irreconciliables.
 */

/** Envoie une transaction et rend sa signature. Fournie par l'appelant. */
export type Envoyer = (
  instructions: TransactionInstruction[],
) => Promise<string>;

/**
 * CONFIRMATION PAR SONDAGE, ET SURTOUT PAS PAR ABONNEMENT.
 *
 * `connection.confirmTransaction` s'abonne a `signatureSubscribe` par
 * WebSocket. Notre point d'acces dedie ACCEPTE la connexion WebSocket mais
 * refuse les abonnements : `Method 'signatureSubscribe' not found`, code -32601,
 * mesure le 02/08. La notification n'arrivait donc jamais, et au bout de la
 * fenetre de validite du bloc web3.js declarait la signature expiree, alors que
 * la transaction etait passee depuis longtemps.
 *
 * Le sondage HTTP n'a pas cette dependance. C'est la meme methode que la ligne
 * de commande de provisionnement emploie deja.
 *
 * L'expiration est jugee sur la HAUTEUR DE BLOC, pas sur un delai arbitraire :
 * c'est le seul critere qui distingue une transaction reellement perdue d'une
 * transaction lente. Tant que la hauteur n'a pas depasse la limite, on attend.
 */
export interface Empreinte {
  blockhash: string;
  lastValidBlockHeight: number;
}

/** Ce dont la confirmation a besoin. Type au plus juste, donc simulable. */
export interface Sondeur {
  getSignatureStatuses(signatures: string[]): Promise<{
    value: ({ err: unknown; confirmationStatus?: string | null } | null)[];
  }>;
  getBlockHeight(): Promise<number>;
  getTransaction(
    signature: string,
    config?: { maxSupportedTransactionVersion?: number },
  ): Promise<{ meta?: { logMessages?: string[] | null } | null } | null>;
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function confirmer(
  sondeur: Sondeur,
  signature: string,
  empreinte: Empreinte,
  options: { delaiMs?: number; attendre?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  const { delaiMs = 1500, attendre = dormir } = options;

  for (;;) {
    const { value } = await sondeur.getSignatureStatuses([signature]);
    const statut = value[0];

    if (statut) {
      if (statut.err) {
        // Le programme a refuse a l'execution. Les journaux ne sont pas dans le
        // statut : on va les chercher, sans quoi le motif du refus serait perdu
        // et la page afficherait un objet illisible a la place d'une regle.
        throw Object.assign(
          new Error(`La transaction a echoue : ${JSON.stringify(statut.err)}`),
          { logs: await journauxDeLaTransaction(sondeur, signature) },
        );
      }
      if (
        statut.confirmationStatus === "confirmed" ||
        statut.confirmationStatus === "finalized"
      ) {
        return;
      }
    }

    // Rien encore. La transaction n'est perdue que si son bloc de reference a
    // expire ET qu'aucun statut n'existe : au dela, elle ne peut plus entrer.
    if (!statut) {
      // Sans argument : la connexion porte deja son niveau d'engagement.
      const hauteur = await sondeur.getBlockHeight();
      if (hauteur > empreinte.lastValidBlockHeight) {
        throw new Error(
          "La transaction n'a pas ete incluse avant l'expiration de son bloc " +
            "de reference. Rien n'a ete debite : reessayez.",
        );
      }
    }

    await attendre(delaiMs);
  }
}

async function journauxDeLaTransaction(
  sondeur: Sondeur,
  signature: string,
): Promise<string[]> {
  try {
    const tx = await sondeur.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });
    return tx?.meta?.logMessages ?? [];
  } catch {
    return [];
  }
}

export interface EtatCoffre {
  actifDuCoffre: bigint;
  offreDeParts: bigint;
  suspendu: boolean;
  decimalesActif: number;
  decimalesParts: number;
  sharesMint: PublicKey;
}

export interface Position {
  parts: bigint;
  actif: bigint;
  /** Le porteur peut-il RECEVOIR des parts ? Deposer n'en depend pas. */
  autorise: boolean;
}

/**
 * Fournisseur inerte : rien n'est signe ici. Anchor exige un portefeuille pour
 * construire un client, la lecture d'etat n'en utilise aucun.
 */
function fournisseur(connection: Connection): AnchorProvider {
  const inerte = {
    publicKey: PublicKey.default,
    signTransaction: async <T>(t: T) => t,
    signAllTransactions: async <T>(t: T[]) => t,
  };
  return new AnchorProvider(connection, inerte as never, {
    commitment: "confirmed",
  });
}

export function connexion(config: Config): Connection {
  return new Connection(config.rpcUrl, "confirmed");
}

/**
 * Programme proprietaire d'un mint, retenu une fois pour toutes.
 *
 * Il est LU on-chain plutot que suppose (USDC et EURC devnet sont du SPL
 * classique, mais rien ne l'impose a un autre actif) et il ne change jamais :
 * le relire a chaque rafraichissement doublait les appels pour rien, sur un
 * point d'acces public qui limite le debit.
 */
const proprietaires = new Map<string, PublicKey>();

async function programmeDuMint(
  connection: Connection,
  mint: PublicKey,
): Promise<PublicKey> {
  const cle = `${connection.rpcEndpoint}|${mint.toBase58()}`;
  const connu = proprietaires.get(cle);
  if (connu) return connu;

  const compte = await connection.getAccountInfo(mint);
  if (!compte) {
    throw new Error(`L'actif ${mint.toBase58()} n'existe pas sur ce reseau.`);
  }
  proprietaires.set(cle, compte.owner);
  return compte.owner;
}

async function contexteResolu(config: Config, connection: Connection) {
  return {
    program: vaultProgram(config.vaultProgramId, fournisseur(connection)),
    depositMint: config.depositMint,
    depositTokenProgram: await programmeDuMint(connection, config.depositMint),
  };
}

async function solde(
  connection: Connection,
  compte: PublicKey,
  programme: PublicKey,
): Promise<bigint> {
  try {
    return (await getAccount(connection, compte, "confirmed", programme)).amount;
  } catch {
    // Un compte de jeton qui n'existe pas encore vaut zero. C'est le cas de
    // tout visiteur qui n'a jamais depose.
    return 0n;
  }
}

export async function lireEtatCoffre(
  config: Config,
  connection: Connection,
): Promise<EtatCoffre> {
  const ctx = await contexteResolu(config, connection);
  const a = adressesDuCoffre(ctx);
  const etat = await lireCoffre(ctx);
  if (!etat) {
    throw new Error(
      "Aucun coffre n'est initialise sur cet actif avec ces identifiants de programme.",
    );
  }
  const [actif, parts] = await Promise.all([
    getMint(connection, config.depositMint, "confirmed", ctx.depositTokenProgram),
    getMint(connection, a.sharesMint, "confirmed", TOKEN_2022_PROGRAM_ID),
  ]);
  return {
    actifDuCoffre: await solde(connection, a.vaultAssets, ctx.depositTokenProgram),
    offreDeParts: parts.supply,
    suspendu: etat.paused,
    decimalesActif: actif.decimals,
    decimalesParts: parts.decimals,
    sharesMint: a.sharesMint,
  };
}

export async function lirePosition(
  config: Config,
  connection: Connection,
  porteur: PublicKey,
): Promise<Position> {
  const ctx = await contexteResolu(config, connection);
  const a = adressesDuCoffre(ctx);
  const hookCtx = {
    program: hookProgram(config.hookProgramId, fournisseur(connection)),
    mint: a.sharesMint,
  };
  const [parts, actif, autorise] = await Promise.all([
    solde(
      connection,
      getAssociatedTokenAddressSync(a.sharesMint, porteur, false, TOKEN_2022_PROGRAM_ID),
      TOKEN_2022_PROGRAM_ID,
    ),
    solde(
      connection,
      getAssociatedTokenAddressSync(
        config.depositMint, porteur, false, ctx.depositTokenProgram,
      ),
      ctx.depositTokenProgram,
    ),
    estAutorise(hookCtx, porteur),
  ]);
  return { parts, actif, autorise };
}

export async function deposer(
  config: Config,
  connection: Connection,
  porteur: PublicKey,
  montant: bigint,
  envoyer: Envoyer,
): Promise<string> {
  const ctx = await contexteResolu(config, connection);
  const a = adressesDuCoffre(ctx);
  const actifs = getAssociatedTokenAddressSync(
    config.depositMint, porteur, false, ctx.depositTokenProgram,
  );
  const parts = getAssociatedTokenAddressSync(
    a.sharesMint, porteur, false, TOKEN_2022_PROGRAM_ID,
  );
  // Le compte de parts est cree au besoin : le programme dedie calcule sa
  // taille depuis les extensions IMPOSEES par le mint, ce qui evite de la
  // calculer nous-memes et de se tromper.
  const creer = createAssociatedTokenAccountIdempotentInstruction(
    porteur, parts, porteur, a.sharesMint, TOKEN_2022_PROGRAM_ID,
  );
  const ix = await instructionDeposit(ctx, porteur, actifs, parts, montant);
  return envoyer([creer, ix]);
}

export async function retirer(
  config: Config,
  connection: Connection,
  porteur: PublicKey,
  parts: bigint,
  envoyer: Envoyer,
): Promise<string> {
  const ctx = await contexteResolu(config, connection);
  const a = adressesDuCoffre(ctx);
  const ix = await instructionWithdraw(
    ctx,
    porteur,
    getAssociatedTokenAddressSync(
      config.depositMint, porteur, false, ctx.depositTokenProgram,
    ),
    getAssociatedTokenAddressSync(a.sharesMint, porteur, false, TOKEN_2022_PROGRAM_ID),
    parts,
  );
  return envoyer([ix]);
}

/**
 * Transfere des parts. SEULE SURFACE ou le controle d'eligibilite se voit : une
 * frappe et une destruction ne sont pas des transferts, donc ni le depot ni le
 * retrait n'invoquent le hook.
 *
 * Le compte du destinataire est cree dans une transaction SEPAREE. Groupe avec
 * le transfert, il disparaitrait avec le refus, et on ne pourrait plus montrer
 * qu'un destinataire non autorise a bien un compte, reste a zero.
 */
export async function transferer(
  config: Config,
  connection: Connection,
  porteur: PublicKey,
  destinataire: PublicKey,
  parts: bigint,
  envoyer: Envoyer,
): Promise<string> {
  const ctx = await contexteResolu(config, connection);
  const a = adressesDuCoffre(ctx);
  const decimales = (
    await getMint(connection, a.sharesMint, "confirmed", TOKEN_2022_PROGRAM_ID)
  ).decimals;

  const source = getAssociatedTokenAddressSync(
    a.sharesMint, porteur, false, TOKEN_2022_PROGRAM_ID,
  );
  const destination = getAssociatedTokenAddressSync(
    a.sharesMint, destinataire, false, TOKEN_2022_PROGRAM_ID,
  );

  if ((await connection.getAccountInfo(destination)) === null) {
    await envoyer([
      createAssociatedTokenAccountIdempotentInstruction(
        porteur, destination, destinataire, a.sharesMint, TOKEN_2022_PROGRAM_ID,
      ),
    ]);
  }

  const hookCtx = {
    program: hookProgram(config.hookProgramId, fournisseur(connection)),
    mint: a.sharesMint,
  };
  return envoyer([
    instructionTransfert(
      hookCtx, source, destination, porteur, destinataire, parts, decimales,
    ),
  ]);
}

/**
 * Motif d'un refus, dans les mots du programme.
 *
 * Un refus dont on ne lit pas le code ne prouve rien, et `custom program error:
 * 0x1771` ne prouve rien a personne. Deux sources, dans cet ordre : le journal
 * porte le message tel que le programme DEPLOYE l'ecrit, et a defaut on
 * retrouve le libelle dans l'IDL commis a partir du programme fautif et du
 * code. Les deux IDL numerotent leurs erreurs a partir de 6000, d'ou le
 * detour par l'identifiant du programme : le code seul est ambigu.
 */
export function motifDuRefus(config: Config, e: unknown): string {
  const journaux = journauxDe(e);

  const message = journaux
    .map((l) => /Error Message: (.+?)\.?$/.exec(l)?.[1])
    .find((m): m is string => !!m);
  if (message) return message;

  // Dans l'ordre des journaux : le programme qui echoue vraiment parle en
  // premier, et Token-2022 REPETE ensuite son code en propageant. Prendre la
  // derniere ligne designerait donc Token-2022, dont nous n'avons pas l'IDL.
  for (const ligne of journaux) {
    const m = /Program (\w+) failed: custom program error: 0x([0-9a-f]+)/i.exec(ligne);
    if (!m) continue;
    const table =
      m[1] === config.hookProgramId.toBase58()
        ? idls.hook.errors
        : m[1] === config.vaultProgramId.toBase58()
          ? idls.vault.errors
          : null;
    const erreur = table?.find((x) => x.code === parseInt(m[2]!, 16));
    if (erreur) return erreur.msg;
  }

  return e instanceof Error ? e.message : String(e);
}

/**
 * Panne de lecture, dite a un visiteur.
 *
 * Le point d'acces public de devnet limite le debit et repond 429 sans
 * prevenir. Recopier sa reponse JSON-RPC a l'ecran laisse croire a une panne du
 * coffre, alors qu'il suffit d'attendre.
 */
export function panneLisible(e: unknown): string {
  const brut = e instanceof Error ? e.message : String(e);
  if (/\b429\b|too many requests|rate limit/i.test(brut)) {
    return (
      "Le point d'acces public de devnet limite le debit. " +
      "Ce n'est pas le coffre : reessayez dans quelques secondes."
    );
  }
  if (/failed to fetch|network|econnrefused|timeout/i.test(brut)) {
    return "Le point d'acces ne repond pas. Reessayez dans un instant.";
  }
  return brut;
}

/** Les journaux voyagent a des profondeurs variables selon le portefeuille. */
function journauxDe(e: unknown): string[] {
  const candidats = [
    e,
    (e as { error?: unknown })?.error,
    (e as { cause?: unknown })?.cause,
  ];
  for (const c of candidats) {
    const journaux = (c as { logs?: unknown })?.logs;
    if (Array.isArray(journaux)) return journaux as string[];
  }
  return [];
}

/** Rend un montant entier lisible, sans jamais passer par un nombre flottant. */
export function formater(montant: bigint, decimales: number): string {
  const unite = 10n ** BigInt(decimales);
  const entiere = montant / unite;
  const reste = (montant % unite).toString().padStart(decimales, "0");
  return `${entiere}.${reste.replace(/0+$/, "") || "0"}`;
}

/** Lit un montant saisi. Refuse plutot que d'arrondir en silence. */
export function enUnites(saisie: string, decimales: number): bigint {
  const propre = saisie.trim().replace(",", ".");
  if (!/^\d*\.?\d*$/.test(propre) || propre === "" || propre === ".") {
    throw new Error(`Montant illisible : ${saisie}`);
  }
  const [entiere = "0", fraction = ""] = propre.split(".");
  if (fraction.length > decimales) {
    throw new Error(
      `Cet actif compte ${decimales} decimales : ${saisie} en demande ${fraction.length}.`,
    );
  }
  return BigInt(entiere + fraction.padEnd(decimales, "0"));
}
