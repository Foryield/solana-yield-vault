import type { Confirmation } from "./diffuser.js";
import type { PortefeuilleProvisionne } from "./provisionner.js";

/**
 * L'orchestrateur : d'un identifiant a une transaction confirmee.
 *
 * Il ne connait ni le fournisseur de garde, ni le reseau, ni nos programmes :
 * il recoit ses quatre etapes en argument. C'est ce qui le rend verifiable sans
 * le moindre identifiant, et c'est deja la forme retenue sur le depot Stellar.
 *
 * L'ORDRE EST LE SUJET, et il n'est pas interchangeable. L'enveloppe est
 * construite en avant-derniere position, apres la dotation et juste avant la
 * diffusion, parce qu'elle porte une empreinte de bloc qui expire en quelques
 * dizaines de secondes. La construire plus tot ferait echouer la chaine sur une
 * transaction expiree, ce qui ressemble a une panne du fournisseur alors que
 * c'est une faute d'ordonnancement.
 */

export interface Etapes {
  provisionner: (nom: string) => Promise<PortefeuilleProvisionne>;
  /** Dote l'adresse et ouvre ses comptes de jeton. Rend sa signature. */
  financer: (adresse: string) => Promise<string>;
  /** Compose le depot pour ce deposant. Rend la transaction serialisee. */
  enveloppe: (deposant: string) => Promise<string>;
  /** Fait signer et diffuser. Rend la signature de la transaction. */
  diffuser: (walletId: string, hex: string) => Promise<string>;
  confirmer: (signature: string) => Promise<Confirmation>;
}

export interface Resume {
  identifiant: string;
  walletId: string;
  adresse: string;
  dotation: string;
  signature: string;
  slot: number;
  aboutie: boolean;
  erreur: string | null;
}

/**
 * Une inclusion en echec ne leve pas : elle se rend telle quelle. La chaine a
 * bien tenu de bout en bout, c'est le depot qui a ete refuse, et confondre les
 * deux ferait passer une regle appliquee pour une panne.
 */
export async function parcours(
  identifiant: string,
  etapes: Etapes,
): Promise<Resume> {
  const { walletId, adresse } = await etapes.provisionner(identifiant);
  const dotation = await etapes.financer(adresse);
  const hex = await etapes.enveloppe(adresse);
  const signature = await etapes.diffuser(walletId, hex);
  const confirmation = await etapes.confirmer(signature);

  return {
    identifiant,
    walletId,
    adresse,
    dotation,
    signature,
    slot: confirmation.slot,
    aboutie: confirmation.aboutie,
    erreur: confirmation.erreur,
  };
}
