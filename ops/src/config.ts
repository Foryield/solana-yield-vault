import { PublicKey } from "@solana/web3.js";

/**
 * Configuration de la ligne de commande, lue depuis l'environnement.
 *
 * TOUT EST EXIGE, RIEN N'EST DEDUIT. En particulier le reseau : le CLI Solana
 * pointe par defaut sur le mainnet, et une commande d'administration qui
 * heriterait de cette configuration ambiante depenserait du SOL reel sur un
 * geste qu'on croyait de test. On refuse donc de deviner.
 *
 * Les identifiants de programme sont exiges pour la meme raison qu'ils le sont
 * dans le client : rien dans l'arbre de travail n'en porte de stable apres un
 * build. Ceux de devnet sont dans `docs/evidence/`.
 */

export interface Config {
  rpcUrl: string;
  vaultProgramId: PublicKey;
  hookProgramId: PublicKey;
  /**
   * Identifiant de l'allocateur, exige seulement par les commandes de venue.
   *
   * FACULTATIF ET NON DEDUIT : l'allocateur n'est pas deploye partout ou le
   * coffre l'est, et le rendre obligatoire empecherait d'administrer un coffre
   * sur un reseau ou il n'existe pas. Les commandes qui en ont besoin le
   * reclament explicitement, plutot que la configuration entiere le reclame
   * pour tout le monde.
   */
  allocatorProgramId: PublicKey | null;
  keypairPath: string;
  /** Vrai si l'on vise le mainnet : sert a exiger une confirmation explicite. */
  estMainnet: boolean;
}

export class ConfigError extends Error {}

/**
 * Reclame l'allocateur au moment ou une commande en a besoin.
 *
 * Le refus nomme la variable ET la raison : un identifiant de programme depend
 * du deploiement, donc rien ne peut le deviner.
 */
export function exigeAllocateur(config: Config): PublicKey {
  if (config.allocatorProgramId === null) {
    throw new ConfigError(
      `ALLOCATOR_PROGRAM_ID est obligatoire pour cette commande. Il depend du ` +
        `deploiement et ne peut pas etre devine ; celui de devnet est dans ` +
        `docs/evidence/.`,
    );
  }
  return config.allocatorProgramId;
}

function exige(nom: string, env: Record<string, string | undefined>): string {
  const v = env[nom];
  if (!v || v.trim() === "") {
    throw new ConfigError(
      `${nom} est obligatoire. Aucune valeur par defaut n'est fournie : ` +
        `deviner le reseau ou un identifiant de programme est precisement ce ` +
        `qu'on veut eviter.`,
    );
  }
  return v.trim();
}

function clePublique(nom: string, valeur: string): PublicKey {
  try {
    return new PublicKey(valeur);
  } catch {
    throw new ConfigError(`${nom} n'est pas une cle publique valide : ${valeur}`);
  }
}

/** Un point d'acces mainnet se reconnait a son hote, pas a une promesse. */
export function viseLeMainnet(rpcUrl: string): boolean {
  const u = rpcUrl.toLowerCase();
  return u.includes("mainnet") || u.includes("api.metaplex.solana.com");
}

export function chargerConfig(env: Record<string, string | undefined>): Config {
  const rpcUrl = exige("SOLANA_RPC_URL", env);
  const estMainnet = viseLeMainnet(rpcUrl);

  // Garde-fou : viser le mainnet doit etre un geste conscient, pas le
  // resultat d'une variable oubliee dans un shell.
  if (estMainnet && env["JE_VISE_LE_MAINNET"] !== "oui") {
    throw new ConfigError(
      `SOLANA_RPC_URL designe un reseau de production (${rpcUrl}). ` +
        `Poser JE_VISE_LE_MAINNET=oui pour confirmer.`,
    );
  }

  return {
    rpcUrl,
    vaultProgramId: clePublique(
      "VAULT_PROGRAM_ID",
      exige("VAULT_PROGRAM_ID", env),
    ),
    hookProgramId: clePublique("HOOK_PROGRAM_ID", exige("HOOK_PROGRAM_ID", env)),
    allocatorProgramId: env["ALLOCATOR_PROGRAM_ID"]?.trim()
      ? clePublique("ALLOCATOR_PROGRAM_ID", env["ALLOCATOR_PROGRAM_ID"].trim())
      : null,
    keypairPath: exige("SOLANA_KEYPAIR", env),
    estMainnet,
  };
}
