import { Connection, PublicKey } from "@solana/web3.js";

/**
 * Configuration du paquet de provisionnement.
 *
 * TROIS LECTURES SEPAREES, et la separation est le sujet. Composer une
 * enveloppe ne demande aucun identifiant de garde ; financer ne demande que la
 * cle de tresorerie ; diffuser ne demande que la garde. Une configuration
 * unique aurait exige les trois partout, donc aurait oblige a poser des
 * identifiants de garde la ou ils n'ont rien a faire.
 *
 * Le reste suit la ligne de `ops/src/config.ts` : tout est exige, rien n'est
 * deduit. Deviner un identifiant de programme ou un reseau est precisement ce
 * qu'on veut eviter.
 */

/**
 * LE VERROU D'ENVIRONNEMENT DU SPIKE S5, ET IL N'EST PAS CONFIGURABLE.
 *
 * Le fournisseur de garde n'a pas d'API de bac a sable : un seul hote sert le
 * mainnet et les reseaux de test. Aucun controle d'URL ne peut donc separer la
 * production du reste, contrairement a ce que le garde-fou supposait d'abord.
 *
 * Ce qu'un programme peut verifier, c'est le RESEAU qu'il demande. Cette
 * constante est la seule valeur que ce paquet demandera jamais, et elle n'est
 * pas lue depuis l'environnement : il n'existe aucune variable a se tromper.
 */
export const RESEAU = "SolanaDevnet" as const;

/**
 * Empreintes de genese relevees contre les reseaux le 2026-08-02.
 *
 * C'est la seule facon HONNETE de nommer un cluster : un point d'acces peut
 * s'appeler comme il veut, sa chaine de genese ne ment pas. Un controle par
 * sous-chaine dans l'URL, tel qu'il existe dans la ligne de commande et dans la
 * page, ne vaut que pour une decision locale sans appel reseau ; ici tout passe
 * par le reseau, donc on le lui demande.
 */
export const GENESE_DEVNET = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const GENESE_MAINNET = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";

export interface Config {
  rpcUrl: string;
  vaultProgramId: PublicKey;
  hookProgramId: PublicKey;
  depositMint: PublicKey;
  reseau: typeof RESEAU;
}

/** Identifiants du fournisseur de garde. Exiges par les seules briques qui l'appellent. */
export interface Garde {
  apiUrl: string;
  authToken: string;
  privateKey: string;
  /**
   * FACULTATIF, et ce n'est pas un oubli. Le defi du fournisseur porte
   * lui-meme la liste des credentials autorises : notre signataire y lit
   * l'identifiant au lieu de le reclamer. Il ne sert qu'a trancher entre
   * plusieurs credentials de type cle sur un meme compte. Cf. `signataire.ts`.
   */
  credId?: string;
}

/** Cle qui dote les portefeuilles neufs. Exigee par la seule brique qui signe localement. */
export interface Tresorerie {
  keypairPath: string;
}

export class ConfigError extends Error {}

type Env = Record<string, string | undefined>;

function exige(nom: string, env: Env): string {
  const v = env[nom];
  if (!v || v.trim() === "") {
    throw new ConfigError(
      `${nom} est obligatoire. Aucune valeur par defaut n'est fournie : ` +
        `deviner le reseau, un identifiant de programme ou un identifiant de ` +
        `garde est precisement ce qu'on veut eviter.`,
    );
  }
  return v.trim();
}

function clePublique(nom: string, env: Env): PublicKey {
  const valeur = exige(nom, env);
  try {
    return new PublicKey(valeur);
  } catch {
    throw new ConfigError(`${nom} n'est pas une cle publique valide : ${valeur}`);
  }
}

export function chargerConfig(env: Env): Config {
  return {
    rpcUrl: exige("SOLANA_RPC_URL", env),
    vaultProgramId: clePublique("VAULT_PROGRAM_ID", env),
    hookProgramId: clePublique("HOOK_PROGRAM_ID", env),
    depositMint: clePublique("DEPOSIT_MINT", env),
    reseau: RESEAU,
  };
}

/**
 * L'hote du fournisseur n'a pas de defaut, alors que le depot voisin en pose
 * un. C'est deliberer : un defaut d'hote donne l'illusion d'un choix
 * d'environnement la ou il n'y en a pas, et c'est exactement le raisonnement
 * qui a mene une cle de production a servir une demonstration.
 */
export function chargerGarde(env: Env): Garde {
  const credId = env["DFNS_CRED_ID"]?.trim();
  return {
    apiUrl: exige("DFNS_API_URL", env),
    authToken: exige("DFNS_AUTH_TOKEN", env),
    privateKey: exige("DFNS_PRIVATE_KEY", env),
    // Facultatif : lu dans le defi par defaut. Une variable vide vaut absente.
    ...(credId ? { credId } : {}),
  };
}

export function chargerTresorerie(env: Env): Tresorerie {
  return { keypairPath: exige("SOLANA_KEYPAIR", env) };
}

/**
 * Refuse de continuer si la chaine au bout du point d'acces n'est pas celle
 * qu'on croit. Appele par toute brique qui touche le reseau, AVANT de signer
 * ou de diffuser quoi que ce soit.
 *
 * Un reseau inconnu est refuse au meme titre que le mainnet : ce paquet dote
 * des portefeuilles et depose pour de vrai, et le seul endroit ou cela est
 * prevu est nomme.
 */
export async function exigeDevnet(connection: Connection): Promise<void> {
  const genese = await connection.getGenesisHash();
  if (genese === GENESE_DEVNET) return;
  const nomme = genese === GENESE_MAINNET ? " (mainnet)" : "";
  throw new ConfigError(
    `SOLANA_RPC_URL ne sert pas devnet : genese ${genese}${nomme}. ` +
      `Ce paquet ne s'execute que sur devnet, dont la genese est ${GENESE_DEVNET}.`,
  );
}

/** Lien explorateur, cluster nomme : une preuve ne vaut que datee et situee. */
export function lienTransaction(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}
