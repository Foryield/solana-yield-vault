import { BN, type Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import type { YieldVault } from "./programs.js";
import { vaultAddresses, type VaultAddresses } from "./addresses.js";

/**
 * Composition des instructions du coffre.
 *
 * Ces fonctions ne signent rien et n'envoient rien : elles rendent une
 * instruction. La signature appartient a l'appelant, qui seul sait s'il tient
 * une cle locale ou un portefeuille de navigateur.
 *
 * Les comptes sont passes EXPLICITEMENT plutot que laisses a la resolution
 * d'Anchor. Certaines graines lisent des donnees de compte (`vault.deposit_mint`)
 * et les resoudre demanderait un appel reseau ; composer une instruction doit
 * rester hors ligne. Nos derivations sont de toute facon confrontees a celles
 * des programmes par les fixtures.
 */

/** Programme de jeton de l'actif depose : SPL classique pour USDC et EURC. */
export interface VaultContext {
  program: Program<YieldVault>;
  depositMint: PublicKey;
  /** Programme proprietaire du mint depose. A verifier on-chain, pas a supposer. */
  depositTokenProgram: PublicKey;
}

export function adressesDuCoffre(ctx: VaultContext): VaultAddresses {
  return vaultAddresses(ctx.program.programId, ctx.depositMint);
}

/**
 * Cree le coffre, le mint des parts et les comptes de detention.
 *
 * `hookProgram` est FIGE ici : changer de programme de conformite exigera un
 * redeploiement. C'est la meme convention que le pool fixe a l'initialisation
 * sur la version Soroban, et elle est deliberee : un coffre dont on peut
 * changer le controle d'eligibilite apres coup ne garantit plus rien.
 */
export async function instructionInitialize(
  ctx: VaultContext,
  admin: PublicKey,
  hookProgram: PublicKey,
): Promise<TransactionInstruction> {
  const a = adressesDuCoffre(ctx);
  return ctx.program.methods
    .initialize(hookProgram)
    .accountsPartial({
      admin,
      depositMint: ctx.depositMint,
      vault: a.vault,
      sharesMint: a.sharesMint,
      vaultAssets: a.vaultAssets,
      deadShares: a.deadShares,
      sharesTokenProgram: TOKEN_2022_PROGRAM_ID,
      depositTokenProgram: ctx.depositTokenProgram,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

/**
 * Depose `amount` unites d'actif.
 *
 * Aucun compte supplementaire de hook n'est requis : une FRAPPE n'est pas un
 * transfert, donc Token-2022 n'invoque pas le hook. Seul un transfert de parts
 * entre porteurs le declenche.
 */
export async function instructionDeposit(
  ctx: VaultContext,
  depositor: PublicKey,
  depositorAssets: PublicKey,
  depositorShares: PublicKey,
  amount: bigint,
): Promise<TransactionInstruction> {
  const a = adressesDuCoffre(ctx);
  return ctx.program.methods
    .deposit(new BN(amount.toString()))
    .accountsPartial({
      depositor,
      vault: a.vault,
      depositMint: ctx.depositMint,
      sharesMint: a.sharesMint,
      vaultAssets: a.vaultAssets,
      deadShares: a.deadShares,
      depositorAssets,
      depositorShares,
      sharesTokenProgram: TOKEN_2022_PROGRAM_ID,
      depositTokenProgram: ctx.depositTokenProgram,
    })
    .instruction();
}

/** Detruit `shares` parts et restitue l'actif au pro-rata. */
export async function instructionWithdraw(
  ctx: VaultContext,
  holder: PublicKey,
  holderAssets: PublicKey,
  holderShares: PublicKey,
  shares: bigint,
): Promise<TransactionInstruction> {
  const a = adressesDuCoffre(ctx);
  return ctx.program.methods
    .withdraw(new BN(shares.toString()))
    .accountsPartial({
      holder,
      vault: a.vault,
      depositMint: ctx.depositMint,
      sharesMint: a.sharesMint,
      vaultAssets: a.vaultAssets,
      holderAssets,
      holderShares,
      sharesTokenProgram: TOKEN_2022_PROGRAM_ID,
      depositTokenProgram: ctx.depositTokenProgram,
    })
    .instruction();
}

/** Suspend ou reprend depots et retraits. Administrateur uniquement. */
export async function instructionSetPaused(
  ctx: VaultContext,
  admin: PublicKey,
  paused: boolean,
): Promise<TransactionInstruction> {
  const a = adressesDuCoffre(ctx);
  return ctx.program.methods
    .setPaused(paused)
    .accountsPartial({ admin, vault: a.vault })
    .instruction();
}

/** Etat du coffre, tel que le programme le porte. */
export interface VaultState {
  admin: PublicKey;
  depositMint: PublicKey;
  sharesMint: PublicKey;
  hookProgram: PublicKey;
  paused: boolean;
}

export async function lireCoffre(
  ctx: VaultContext,
): Promise<VaultState | null> {
  const a = adressesDuCoffre(ctx);
  const compte = await ctx.program.account.vault.fetchNullable(a.vault);
  return compte as VaultState | null;
}
