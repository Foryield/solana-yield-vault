import { Program, type Provider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import vaultIdl from "./idl/yield_vault.json" with { type: "json" };
import hookIdl from "./idl/compliance_hook.json" with { type: "json" };
import allocatorIdl from "./idl/allocator.json" with { type: "json" };
import type { YieldVault } from "./idl/yield_vault.js";
import type { ComplianceHook } from "./idl/compliance_hook.js";
import type { Allocator } from "./idl/allocator.js";

/**
 * Construction des clients Anchor des deux programmes.
 *
 * L'IDENTIFIANT DE PROGRAMME EST OBLIGATOIRE, et ce n'est pas un oubli d'API.
 *
 * Les IDL commis ne portent PAS d'adresse : `anchor build` fabrique des paires
 * de cles quand elles manquent, puis reecrit tout ce qui porte un identifiant
 * pour s'y aligner, y compris `Anchor.toml` et le `declare_id!` des sources.
 * Rien dans l'arbre de travail n'en porte de stable apres un build, donc rien
 * de fiable ne peut etre fige dans un fichier genere.
 *
 * L'adresse depend de toute facon du deploiement : celles de devnet sont
 * consignees dans `docs/evidence/`, ecrit a la main. Exiger l'identifiant en
 * argument rend cette dependance visible plutot que devinee.
 */

export type { Allocator, ComplianceHook, YieldVault };

/**
 * Unique conversion de type du paquet, et elle est bornee : les types generes
 * declarent `address` en type LITTERAL, alors que l'IDL commis n'en porte
 * aucune et que la vraie arrive en argument. La conversion ne masque donc
 * aucune erreur reelle, elle raccorde un artefact de typage.
 */
function avecAdresse<T>(idl: unknown, programId: PublicKey): T {
  return { ...(idl as object), address: programId.toBase58() } as T;
}

export function vaultProgram(
  programId: PublicKey,
  provider: Provider,
): Program<YieldVault> {
  return new Program<YieldVault>(avecAdresse(vaultIdl, programId), provider);
}

export function hookProgram(
  programId: PublicKey,
  provider: Provider,
): Program<ComplianceHook> {
  return new Program<ComplianceHook>(avecAdresse(hookIdl, programId), provider);
}

export function allocatorProgram(
  programId: PublicKey,
  provider: Provider,
): Program<Allocator> {
  return new Program<Allocator>(avecAdresse(allocatorIdl, programId), provider);
}

/** IDL bruts, pour inspecter l'interface sans instancier de client. */
export const idls = {
  vault: vaultIdl,
  hook: hookIdl,
  allocator: allocatorIdl,
};
