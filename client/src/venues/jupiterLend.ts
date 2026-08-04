import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

/**
 * Derivation des comptes de la venue de pret Jupiter Lend.
 *
 * CES ADRESSES NE SONT PAS LES NOTRES. Elles appartiennent a un tiers, et nous
 * ne faisons que les recalculer pour composer une transaction. D'ou deux
 * precautions qui n'existent nulle part ailleurs dans ce paquet.
 *
 * PREMIERE PRECAUTION : LES IDENTIFIANTS DE PROGRAMME SONT PROPRES AU CLUSTER.
 * Le paquet publie par l'editeur code en dur ceux du mainnet, qui sont ABSENTS
 * de devnet, et reciproquement. Les trois identifiants devnet ci-dessous n'ont
 * donc pas ete recopies du paquet : ils ont ete LUS SUR LA CHAINE le 04/08, en
 * demandant a devnet le proprietaire des comptes que le marche designe. La
 * methode est reproductible et consignee dans `docs/evidence/`.
 *
 * SECONDE PRECAUTION : LES GRAINES, ELLES, VIENNENT DU PAQUET DE L'EDITEUR, et
 * rien ne garantissait qu'elles vaillent aussi pour devnet. C'est verifie et
 * non suppose : cinq des dix adresses derivees ici ont un temoin lu sur la
 * chaine, et les cinq concordent. Le test qui les confronte porte ce constat.
 */

/** Les trois programmes de la venue, tels que deployes sur un cluster donne. */
export interface ProgrammesJupiterLend {
  /** Porte les marches, le jeton de recu et l'administration. */
  pret: PublicKey;
  /** Porte les reserves, les positions, les modeles de taux et la liquidite. */
  liquidite: PublicKey;
  /** Porte le modele de taux de recompenses. */
  recompenses: PublicKey;
}

/**
 * Identifiants DEVNET, lus sur la chaine le 2026-08-04.
 *
 * Ne jamais les employer sur un autre cluster : sur Solana, une adresse de
 * programme est propre a son reseau. Les valeurs du mainnet sont differentes et
 * ne sont volontairement pas portees ici, ce depot ne visant que devnet.
 */
export const PROGRAMMES_JUPITER_LEND_DEVNET: ProgrammesJupiterLend = {
  pret: new PublicKey("7tjE28izRUjzmxC1QNXnNwcc4N82CNYCexf3k8mw67s3"),
  liquidite: new PublicKey("5uDkCoM96pwGYhAUucvCzLfm5UcjVRuxz6gH81RnRBmL"),
  recompenses: new PublicKey("68LHLkpgjAvo6Lgd9FT6KYEX4FWn1911EohSXxHYMFjc"),
};

const graine = (t: string): Buffer => Buffer.from(t);
const pda = (seeds: Buffer[], programme: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync(seeds, programme)[0];

/** Mint du jeton de recu emis contre un depot de cet actif. */
export function jetonDeRecuAddress(p: ProgrammesJupiterLend, actif: PublicKey): PublicKey {
  return pda([graine("f_token_mint"), actif.toBuffer()], p.pret);
}

/** Compte d'administration de la venue. Un seul pour tous les actifs. */
export function administrationAddress(p: ProgrammesJupiterLend): PublicKey {
  return pda([graine("lending_admin")], p.pret);
}

/**
 * Compte de marche, celui qui porte les deux prix d'echange.
 *
 * Sa derivation depend du jeton de recu, lui-meme derive : une erreur sur le
 * premier se propage silencieusement au second.
 */
export function marcheAddress(p: ProgrammesJupiterLend, actif: PublicKey): PublicKey {
  return pda(
    [graine("lending"), actif.toBuffer(), jetonDeRecuAddress(p, actif).toBuffer()],
    p.pret,
  );
}

/** Reserves de la couche de liquidite pour cet actif. */
export function reservesAddress(p: ProgrammesJupiterLend, actif: PublicKey): PublicKey {
  return pda([graine("reserve"), actif.toBuffer()], p.liquidite);
}

/** Position de fourniture du marche sur la couche de liquidite. */
export function positionDeLiquiditeAddress(
  p: ProgrammesJupiterLend,
  actif: PublicKey,
): PublicKey {
  return pda(
    [graine("user_supply_position"), actif.toBuffer(), marcheAddress(p, actif).toBuffer()],
    p.liquidite,
  );
}

/** Modele de taux de la couche de liquidite. */
export function modeleDeTauxAddress(
  p: ProgrammesJupiterLend,
  actif: PublicKey,
): PublicKey {
  return pda([graine("rate_model"), actif.toBuffer()], p.liquidite);
}

/** Couche de liquidite elle-meme. Un seul compte pour tous les actifs. */
export function liquiditeAddress(p: ProgrammesJupiterLend): PublicKey {
  return pda([graine("liquidity")], p.liquidite);
}

/** Modele de taux de recompenses, sur le troisieme programme. */
export function modeleDeRecompensesAddress(
  p: ProgrammesJupiterLend,
  actif: PublicKey,
): PublicKey {
  return pda([graine("lending_rewards_rate_model"), actif.toBuffer()], p.recompenses);
}

/**
 * Compte de reclamation, exige par le retrait et absent du depot.
 *
 * SA GRAINE EST L'ADMINISTRATION DE LA VENUE, PAS LE RETIREUR, malgre un nom de
 * graine qui dit « user ». Consequence directe et verifiee le 04/08 : il en
 * existe UN SEUL par actif, partage par tous, et celui du marche USDC devnet
 * existe deja. Le prealable d'exploitation que le plan annoncait est donc leve
 * pour cet actif ; il ne le serait pas pour un actif dont personne n'a encore
 * retire.
 */
export function compteDeReclamationAddress(
  p: ProgrammesJupiterLend,
  actif: PublicKey,
): PublicKey {
  return pda(
    [graine("user_claim"), administrationAddress(p).toBuffer(), actif.toBuffer()],
    p.liquidite,
  );
}

/**
 * Coffre de la venue : un compte associe ordinaire, et non une adresse derivee
 * de programme. Le confondre avec le notre serait une faute de lecture, d'ou
 * son nom.
 */
export function coffreDeLaVenueAddress(
  p: ProgrammesJupiterLend,
  actif: PublicKey,
  programmeDeJeton: PublicKey,
): PublicKey {
  return getAssociatedTokenAddressSync(
    actif,
    liquiditeAddress(p),
    true,
    programmeDeJeton,
  );
}

/** Tous les comptes de la venue pour un actif, en une lecture. */
export interface ComptesDeLaVenue {
  jetonDeRecu: PublicKey;
  administration: PublicKey;
  marche: PublicKey;
  reserves: PublicKey;
  positionDeLiquidite: PublicKey;
  modeleDeTaux: PublicKey;
  liquidite: PublicKey;
  modeleDeRecompenses: PublicKey;
  compteDeReclamation: PublicKey;
  coffreDeLaVenue: PublicKey;
}

/**
 * Le programme de jeton est un ARGUMENT et non une constante : le coffre de la
 * venue est un compte associe, dont l'adresse depend du programme qui detient
 * le mint. Le lire sur la chaine plutot que le supposer est la meme discipline
 * que celle deja appliquee a l'initialisation d'un coffre.
 */
export function comptesDeLaVenue(
  p: ProgrammesJupiterLend,
  actif: PublicKey,
  programmeDeJeton: PublicKey,
): ComptesDeLaVenue {
  return {
    jetonDeRecu: jetonDeRecuAddress(p, actif),
    administration: administrationAddress(p),
    marche: marcheAddress(p, actif),
    reserves: reservesAddress(p, actif),
    positionDeLiquidite: positionDeLiquiditeAddress(p, actif),
    modeleDeTaux: modeleDeTauxAddress(p, actif),
    liquidite: liquiditeAddress(p),
    modeleDeRecompenses: modeleDeRecompensesAddress(p, actif),
    compteDeReclamation: compteDeReclamationAddress(p, actif),
    coffreDeLaVenue: coffreDeLaVenueAddress(p, actif, programmeDeJeton),
  };
}
