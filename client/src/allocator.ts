import { BN, type Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import type { Allocator } from "./programs.js";
import { positionAddress } from "./addresses.js";
import {
  comptesDeLaVenue,
  type ComptesDeLaVenue,
  type ProgrammesJupiterLend,
} from "./venues/jupiterLend.js";

/**
 * Composition des instructions de l'allocateur.
 *
 * Meme posture que le coffre : ces fonctions ne signent rien et n'envoient
 * rien. Elles different sur un point, et il est structurel : la MAJORITE DES
 * COMPTES N'EST PAS A NOUS. Vingt comptes au depot, vingt et un au retrait,
 * dont dix-sept et dix-huit appartiennent a un tiers.
 *
 * D'ou le decoupage : `comptesDeLaVenue` derive ce qui est au tiers, ce module
 * derive ce qui est a nous, et l'assemblage est fait une seule fois ici. Un
 * appelant qui composerait sa propre liste se tromperait de rang tot ou tard.
 */

export interface AllocatorContext {
  program: Program<Allocator>;
  /** Les trois programmes de la venue, PROPRES AU CLUSTER vise. */
  programmes: ProgrammesJupiterLend;
  /** Mint de l'actif place. */
  actif: PublicKey;
  /** Programme proprietaire du mint. A lire on-chain, pas a supposer. */
  programmeDeJeton: PublicKey;
  /** Coffre servi. N'entre que dans la graine de la position. */
  coffre: PublicKey;
}

/** Les comptes que l'allocateur derive pour lui-meme, par opposition a ceux de la venue. */
export interface ComptesDeLaPosition {
  /** Autorite de signature, une par couple coffre et marche. */
  position: PublicKey;
  /** Compte d'actif de la position : source du depot, destination du retrait. */
  actifDeLaPosition: PublicKey;
  /** Compte de jeton de recu de la position. */
  recuDeLaPosition: PublicKey;
}

/**
 * LES DEUX COMPTES DE JETON SONT DETENUS PAR UNE ADRESSE DERIVEE, d'ou le
 * troisieme argument a vrai : sans lui, la bibliotheque refuse de deriver un
 * compte associe pour un proprietaire hors courbe. C'est le genre de detail qui
 * ne se voit qu'a l'execution.
 */
export function adressesDeLaPosition(
  ctx: AllocatorContext,
  marche: PublicKey,
): ComptesDeLaPosition {
  const position = positionAddress(ctx.program.programId, ctx.coffre, marche);
  const jetonDeRecu = comptesDeLaVenue(
    ctx.programmes,
    ctx.actif,
    ctx.programmeDeJeton,
  ).jetonDeRecu;
  return {
    position,
    actifDeLaPosition: getAssociatedTokenAddressSync(
      ctx.actif,
      position,
      true,
      ctx.programmeDeJeton,
    ),
    recuDeLaPosition: getAssociatedTokenAddressSync(
      jetonDeRecu,
      position,
      true,
      ctx.programmeDeJeton,
    ),
  };
}

/** Tout ce qu'une transaction de l'allocateur met en jeu, derive en une fois. */
export interface AdressesAllocateur extends ComptesDeLaPosition {
  venue: ComptesDeLaVenue;
}

export function adressesDeLAllocateur(ctx: AllocatorContext): AdressesAllocateur {
  const venue = comptesDeLaVenue(ctx.programmes, ctx.actif, ctx.programmeDeJeton);
  return { venue, ...adressesDeLaPosition(ctx, venue.marche) };
}

/**
 * Depose `montant` unites d'actif sur la venue.
 *
 * AUCUN PLANCHER N'EST PASSE ICI, et c'est voulu : le programme le calcule
 * lui-meme, sur la chaine, apres avoir rafraichi les prix. Le faire venir d'un
 * appelant laisserait desarmer la protection en passant zero.
 */
export async function instructionDeposerJupiterLend(
  ctx: AllocatorContext,
  operateur: PublicKey,
  montant: bigint,
): Promise<TransactionInstruction> {
  const a = adressesDeLAllocateur(ctx);
  return ctx.program.methods
    .deposerJupiterLend(new BN(montant.toString()))
    .accountsPartial({
      operateur,
      coffre: ctx.coffre,
      marche: a.venue.marche,
      position: a.position,
      actifDeLaPosition: a.actifDeLaPosition,
      recuDeLaPosition: a.recuDeLaPosition,
      actif: ctx.actif,
      jetonDeRecu: a.venue.jetonDeRecu,
      administration: a.venue.administration,
      reservesDeLiquidite: a.venue.reserves,
      positionDeLiquidite: a.venue.positionDeLiquidite,
      modeleDeTaux: a.venue.modeleDeTaux,
      coffreDeLaVenue: a.venue.coffreDeLaVenue,
      liquidite: a.venue.liquidite,
      programmeDeLiquidite: ctx.programmes.liquidite,
      modeleDeRecompenses: a.venue.modeleDeRecompenses,
      programmeDePret: ctx.programmes.pret,
      programmeDeJeton: ctx.programmeDeJeton,
      programmeDeCompteAssocie: ASSOCIATED_TOKEN_PROGRAM_ID,
      programmeSysteme: SystemProgram.programId,
    })
    .instruction();
}

/**
 * Retire `montant` unites d'actif en brulant au plus `partsMaximales` jetons.
 *
 * LE PLAFOND EST UN ARGUMENT, contrairement au plancher du depot, et
 * l'asymetrie est argumentee dans le plan : la conversion inverse n'a jamais
 * ete mesuree, et une borne deduite plutot que mesuree ferait echouer tous les
 * retraits. Passer une valeur tres large n'expose pas plus que la variante nue
 * de la venue, mais elle desarme la bretelle : la ceinture, elle, reste, le
 * programme exigeant de son cote que l'actif demande soit bien arrive.
 */
export async function instructionRetirerJupiterLend(
  ctx: AllocatorContext,
  operateur: PublicKey,
  montant: bigint,
  partsMaximales: bigint,
): Promise<TransactionInstruction> {
  const a = adressesDeLAllocateur(ctx);
  return ctx.program.methods
    .retirerJupiterLend(new BN(montant.toString()), new BN(partsMaximales.toString()))
    .accountsPartial({
      operateur,
      coffre: ctx.coffre,
      marche: a.venue.marche,
      position: a.position,
      actifDeLaPosition: a.actifDeLaPosition,
      recuDeLaPosition: a.recuDeLaPosition,
      actif: ctx.actif,
      jetonDeRecu: a.venue.jetonDeRecu,
      administration: a.venue.administration,
      reservesDeLiquidite: a.venue.reserves,
      positionDeLiquidite: a.venue.positionDeLiquidite,
      modeleDeTaux: a.venue.modeleDeTaux,
      coffreDeLaVenue: a.venue.coffreDeLaVenue,
      compteDeReclamation: a.venue.compteDeReclamation,
      liquidite: a.venue.liquidite,
      programmeDeLiquidite: ctx.programmes.liquidite,
      modeleDeRecompenses: a.venue.modeleDeRecompenses,
      programmeDePret: ctx.programmes.pret,
      programmeDeJeton: ctx.programmeDeJeton,
      programmeDeCompteAssocie: ASSOCIATED_TOKEN_PROGRAM_ID,
      programmeSysteme: SystemProgram.programId,
    })
    .instruction();
}
