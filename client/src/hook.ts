import type { Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import { allowlistEntryAddress, extraAccountMetasAddress, hookConfigAddress } from "./addresses.js";
import type { ComplianceHook } from "./programs.js";

/**
 * Composition des instructions du module de conformite.
 *
 * Le hook gouverne un mint, quel qu'il soit : il ne connait pas le coffre. Un
 * protocole sans lien avec ce projet peut le reprendre seul, ce qui est la
 * raison d'etre du decoupage.
 */

export interface HookContext {
  program: Program<ComplianceHook>;
  mint: PublicKey;
}

export function adressesDuHook(ctx: HookContext) {
  return {
    config: hookConfigAddress(ctx.program.programId, ctx.mint),
    extraAccountMetas: extraAccountMetasAddress(ctx.program.programId, ctx.mint),
  };
}

export function adresseEntree(ctx: HookContext, holder: PublicKey): PublicKey {
  return allowlistEntryAddress(ctx.program.programId, ctx.mint, holder);
}

/**
 * Attache le hook a un mint : cree sa configuration et la liste de comptes
 * supplementaires que Token-2022 lira a chaque transfert.
 *
 * `authority` SIGNE : on ne doit pas pouvoir attacher un hook au nom de
 * quelqu'un qui l'ignore.
 */
export async function instructionAttacher(
  ctx: HookContext,
  payer: PublicKey,
  authority: PublicKey,
): Promise<TransactionInstruction> {
  const a = adressesDuHook(ctx);
  return ctx.program.methods
    .initialize()
    .accountsPartial({
      payer,
      authority,
      mint: ctx.mint,
      config: a.config,
      extraAccountMetaList: a.extraAccountMetas,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

/** Autorise `holder` a RECEVOIR des parts du mint gouverne. */
export async function instructionAutoriser(
  ctx: HookContext,
  payer: PublicKey,
  authority: PublicKey,
  holder: PublicKey,
): Promise<TransactionInstruction> {
  const a = adressesDuHook(ctx);
  return ctx.program.methods
    .allow(holder)
    .accountsPartial({
      payer,
      config: a.config,
      authority,
      entry: adresseEntree(ctx, holder),
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

/**
 * Retire l'autorisation de `holder`. Le compte est FERME : son depot revient a
 * l'autorite et il ne reste aucun etat residuel a interpreter.
 */
export async function instructionRevoquer(
  ctx: HookContext,
  authority: PublicKey,
  holder: PublicKey,
): Promise<TransactionInstruction> {
  const a = adressesDuHook(ctx);
  return ctx.program.methods
    .revoke(holder)
    .accountsPartial({
      config: a.config,
      authority,
      entry: adresseEntree(ctx, holder),
    })
    .instruction();
}

/**
 * Comptes a joindre a un TRANSFERT de parts, dans l'ordre attendu.
 *
 * Token-2022 resout la liste de comptes supplementaires contre les comptes
 * additionnels de l'instruction : il faut donc les lui fournir. L'entree de
 * liste est celle du DESTINATAIRE, et Token-2022 la derive lui-meme depuis les
 * donnees du compte de destination : la calculer ici sert a la joindre, pas a
 * la choisir.
 *
 * Ni le depot ni le retrait n'en ont besoin : une frappe et une destruction ne
 * sont pas des transferts.
 */
export function comptesPourTransfert(
  ctx: HookContext,
  destinationOwner: PublicKey,
): PublicKey[] {
  const a = adressesDuHook(ctx);
  return [ctx.program.programId, a.extraAccountMetas, adresseEntree(ctx, destinationOwner)];
}

/** `null` si le porteur n'est pas autorise : l'existence du compte vaut autorisation. */
export async function estAutorise(
  ctx: HookContext,
  holder: PublicKey,
): Promise<boolean> {
  const compte = await ctx.program.account.allowlistEntry.fetchNullable(
    adresseEntree(ctx, holder),
  );
  return compte !== null;
}
