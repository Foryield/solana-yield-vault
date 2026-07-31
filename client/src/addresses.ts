import { PublicKey } from "@solana/web3.js";

/**
 * Derivation des adresses des deux programmes.
 *
 * ATTENTION : ces fonctions sont une SECONDE implementation. Les programmes
 * derivent les memes adresses en Rust, dans leurs contraintes de comptes. Une
 * divergence ne se voit pas a la compilation et se traduit par un compte
 * introuvable a l'execution, ce qui est un des symptomes les plus opaques de
 * Solana.
 *
 * D'ou les fixtures : `test/fixtures/addresses.json` est produit par le cote
 * RUST et relu ici. Les deux implementations sont ainsi confrontees a chaque
 * execution des tests, plutot que supposees d'accord.
 */

/** Graines du coffre. Doivent rester identiques a `programs/yield-vault/src/state.rs`. */
export const VAULT_SEED = Buffer.from("vault");
export const SHARES_SEED = Buffer.from("shares");
export const ASSETS_SEED = Buffer.from("assets");
export const DEAD_SEED = Buffer.from("dead");

/** Graines du module de conformite. */
export const CONFIG_SEED = Buffer.from("config");
export const ALLOW_SEED = Buffer.from("allow");

/**
 * Graine imposee par l'interface de hook de transfert, et non choisie par
 * nous : Token-2022 derive lui-meme cette adresse pour trouver la liste de
 * comptes supplementaires. La changer rendrait le hook inerte.
 */
export const EXTRA_ACCOUNT_METAS_SEED = Buffer.from("extra-account-metas");

/** Un coffre par actif depose : son adresse se calcule sans registre. */
export function vaultAddress(programId: PublicKey, depositMint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, depositMint.toBuffer()],
    programId,
  )[0];
}

export function sharesMintAddress(programId: PublicKey, vault: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([SHARES_SEED, vault.toBuffer()], programId)[0];
}

export function vaultAssetsAddress(programId: PublicKey, vault: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([ASSETS_SEED, vault.toBuffer()], programId)[0];
}

/** Compte des parts mortes. Aucune instruction ne l'ouvre : il ne se vide jamais. */
export function deadSharesAddress(programId: PublicKey, vault: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([DEAD_SEED, vault.toBuffer()], programId)[0];
}

/** Configuration du hook pour un mint donne. */
export function hookConfigAddress(hookProgramId: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [CONFIG_SEED, mint.toBuffer()],
    hookProgramId,
  )[0];
}

/**
 * Entree de liste d'autorisation d'un porteur.
 *
 * Cote chaine, cette adresse n'est jamais fournie par l'appelant : Token-2022
 * la derive depuis les DONNEES du compte de destination. La calculer ici sert
 * uniquement a la joindre a la transaction, pas a la choisir.
 */
export function allowlistEntryAddress(
  hookProgramId: PublicKey,
  mint: PublicKey,
  holder: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [ALLOW_SEED, mint.toBuffer(), holder.toBuffer()],
    hookProgramId,
  )[0];
}

export function extraAccountMetasAddress(
  hookProgramId: PublicKey,
  mint: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [EXTRA_ACCOUNT_METAS_SEED, mint.toBuffer()],
    hookProgramId,
  )[0];
}

/** Toutes les adresses d'un coffre, derivees d'un seul actif. */
export interface VaultAddresses {
  vault: PublicKey;
  sharesMint: PublicKey;
  vaultAssets: PublicKey;
  deadShares: PublicKey;
}

export function vaultAddresses(
  programId: PublicKey,
  depositMint: PublicKey,
): VaultAddresses {
  const vault = vaultAddress(programId, depositMint);
  return {
    vault,
    sharesMint: sharesMintAddress(programId, vault),
    vaultAssets: vaultAssetsAddress(programId, vault),
    deadShares: deadSharesAddress(programId, vault),
  };
}
