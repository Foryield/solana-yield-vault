import { PublicKey } from "@solana/web3.js";

/**
 * Configuration de la demonstration, lue depuis l'environnement de
 * construction.
 *
 * TOUT EST EXIGE, RIEN N'EST DEDUIT, comme dans `ops/src/config.ts` et pour la
 * meme raison : une page qui devine un identifiant de programme ou un reseau
 * afficherait des soldes faux avec l'aplomb des vrais.
 *
 * Une difference avec la ligne de commande, imposee par l'outil : Next remplace
 * les occurrences LITTERALES de `process.env.NEXT_PUBLIC_*` a la construction.
 * On ne peut donc pas indexer l'environnement par une variable ; chaque nom est
 * ecrit en toutes lettres ci-dessous, et la validation vient apres.
 */

export interface Config {
  rpcUrl: string;
  vaultProgramId: PublicKey;
  hookProgramId: PublicKey;
  depositMint: PublicKey;
  porteurAutorise: PublicKey;
  porteurNonAutorise: PublicKey;
}

export class ConfigError extends Error {}

export type Environnement = Partial<Record<Nom, string | undefined>>;

type Nom =
  | "NEXT_PUBLIC_SOLANA_RPC_URL"
  | "NEXT_PUBLIC_VAULT_PROGRAM_ID"
  | "NEXT_PUBLIC_HOOK_PROGRAM_ID"
  | "NEXT_PUBLIC_DEPOSIT_MINT"
  | "NEXT_PUBLIC_PORTEUR_AUTORISE"
  | "NEXT_PUBLIC_PORTEUR_NON_AUTORISE";

/** Les seules occurrences litterales du fichier, donc les seules que Next voit. */
export function lireEnvironnement(): Environnement {
  return {
    NEXT_PUBLIC_SOLANA_RPC_URL: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
    NEXT_PUBLIC_VAULT_PROGRAM_ID: process.env.NEXT_PUBLIC_VAULT_PROGRAM_ID,
    NEXT_PUBLIC_HOOK_PROGRAM_ID: process.env.NEXT_PUBLIC_HOOK_PROGRAM_ID,
    NEXT_PUBLIC_DEPOSIT_MINT: process.env.NEXT_PUBLIC_DEPOSIT_MINT,
    NEXT_PUBLIC_PORTEUR_AUTORISE: process.env.NEXT_PUBLIC_PORTEUR_AUTORISE,
    NEXT_PUBLIC_PORTEUR_NON_AUTORISE: process.env.NEXT_PUBLIC_PORTEUR_NON_AUTORISE,
  };
}

function exige(nom: Nom, env: Environnement): string {
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

function clePublique(nom: Nom, env: Environnement): PublicKey {
  const valeur = exige(nom, env);
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

export function chargerConfig(env: Environnement = lireEnvironnement()): Config {
  const rpcUrl = exige("NEXT_PUBLIC_SOLANA_RPC_URL", env);

  // Cette demonstration est un objet de reseau de test : elle envoie des
  // transactions depuis le portefeuille d'un visiteur, et rien ici n'a ete
  // audite pour de la valeur reelle. Pointee sur le mainnet, elle refuse de
  // s'afficher plutot que de laisser croire le contraire.
  if (viseLeMainnet(rpcUrl)) {
    throw new ConfigError(
      `NEXT_PUBLIC_SOLANA_RPC_URL designe un reseau de production (${rpcUrl}). ` +
        `Cette demonstration ne s'execute que sur un reseau de test.`,
    );
  }

  return {
    rpcUrl,
    vaultProgramId: clePublique("NEXT_PUBLIC_VAULT_PROGRAM_ID", env),
    hookProgramId: clePublique("NEXT_PUBLIC_HOOK_PROGRAM_ID", env),
    depositMint: clePublique("NEXT_PUBLIC_DEPOSIT_MINT", env),
    porteurAutorise: clePublique("NEXT_PUBLIC_PORTEUR_AUTORISE", env),
    porteurNonAutorise: clePublique("NEXT_PUBLIC_PORTEUR_NON_AUTORISE", env),
  };
}

/** Lien explorateur, cluster nomme : une preuve ne vaut que datee et situee. */
export function lienTransaction(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}
