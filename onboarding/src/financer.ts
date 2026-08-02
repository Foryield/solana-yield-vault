import {
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

/**
 * Deuxieme brique, ET LA SEULE QUE LE DEPOT STELLAR N'A PAS.
 *
 * La-bas, un portefeuille neuf est cree et finance par un robinet appelable en
 * une requete. Ici, rien de tel : la distribution en ligne de commande est
 * bloquee en pratique sur devnet, et le robinet de l'emetteur de l'actif
 * plafonne a deux demandes par tranche de huit heures, par adresse, depuis une
 * page web. Aucun robinet n'est appelable par programme pour une adresse neuve.
 *
 * Le financement vient donc de la tresorerie, qui signe LOCALEMENT. C'est la
 * seule brique ou une cle nous appartient.
 *
 * Elle ouvre aussi les deux comptes de jeton du beneficiaire, et ce n'est pas
 * de la generosite : transferer l'actif exige de toute facon que son compte
 * existe, donc la brique sait deja en ouvrir un. Ouvrir le second au meme
 * moment coute une instruction et retire du chemin critique tout ce qui n'a pas
 * besoin du fournisseur de garde. L'enveloppe se reduit alors au seul depot,
 * ce qui compte : une empreinte de bloc expire vite, et le fournisseur
 * documente lui-meme une fenetre de quatre-vingt-dix secondes entre
 * construction et diffusion.
 */

/**
 * Dotation en SOL par defaut : 0,01 SOL.
 *
 * Le beneficiaire ne paie que les frais de sa propre transaction de depot,
 * environ cinq mille lamports par signature, la location de ses deux comptes
 * etant a la charge de la tresorerie. La marge est large a dessein : un compte
 * systeme vide peut etre balaye, et redoter apres coup couterait une
 * transaction de plus.
 */
export const LAMPORTS_PAR_DEFAUT = 10_000_000n;

export interface DotationDemandee {
  payeur: PublicKey;
  beneficiaire: PublicKey;
  depositMint: PublicKey;
  /** Programme proprietaire de l'actif. A lire on-chain, jamais a supposer. */
  programmeDeLActif: PublicKey;
  sharesMint: PublicKey;
  decimalesDeLActif: number;
  lamports: bigint;
  actif: bigint;
}

export interface ComptesDuPorteur {
  actif: PublicKey;
  parts: PublicKey;
}

export function comptesDuPorteur(
  porteur: PublicKey,
  depositMint: PublicKey,
  programmeDeLActif: PublicKey,
  sharesMint: PublicKey,
): ComptesDuPorteur {
  return {
    actif: getAssociatedTokenAddressSync(
      depositMint,
      porteur,
      false,
      programmeDeLActif,
    ),
    parts: getAssociatedTokenAddressSync(
      sharesMint,
      porteur,
      false,
      TOKEN_2022_PROGRAM_ID,
    ),
  };
}

/**
 * Les instructions de la dotation, composees HORS LIGNE. Rien n'est signe ni
 * envoye ici : l'appelant seul sait avec quelle cle il signe.
 *
 * Le transfert d'actif est verifie plutot que simple : il porte le mint et ses
 * decimales, et echoue plutot que de deplacer un montant mal compte si le mint
 * n'est pas celui qu'on croit.
 *
 * Le compte de parts est ouvert par le programme dedie, qui calcule sa taille
 * depuis les extensions IMPOSEES par le mint. Aucune taille n'est calculee a la
 * main, ce qui est la seule facon correcte d'ouvrir un compte sur un jeton a
 * crochet de transfert.
 */
export function instructionsDeDotation(
  d: DotationDemandee,
): TransactionInstruction[] {
  if (d.lamports <= 0n) throw new Error("la dotation en SOL doit etre positive");
  if (d.actif <= 0n) throw new Error("la dotation en actif doit etre positive");

  const beneficiaire = comptesDuPorteur(
    d.beneficiaire,
    d.depositMint,
    d.programmeDeLActif,
    d.sharesMint,
  );
  const source = getAssociatedTokenAddressSync(
    d.depositMint,
    d.payeur,
    false,
    d.programmeDeLActif,
  );

  return [
    SystemProgram.transfer({
      fromPubkey: d.payeur,
      toPubkey: d.beneficiaire,
      lamports: d.lamports,
    }),
    createAssociatedTokenAccountIdempotentInstruction(
      d.payeur,
      beneficiaire.actif,
      d.beneficiaire,
      d.depositMint,
      d.programmeDeLActif,
    ),
    createTransferCheckedInstruction(
      source,
      d.depositMint,
      beneficiaire.actif,
      d.payeur,
      d.actif,
      d.decimalesDeLActif,
      [],
      d.programmeDeLActif,
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      d.payeur,
      beneficiaire.parts,
      d.beneficiaire,
      d.sharesMint,
      TOKEN_2022_PROGRAM_ID,
    ),
  ];
}
