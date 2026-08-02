import type { DfnsApiClient } from "@dfns/sdk";
import { RESEAU } from "./config.js";

/**
 * Premiere brique : un portefeuille nait chez le fournisseur de garde, a
 * partir d'un simple identifiant. Aucune extension, aucune phrase de
 * recuperation, et la cle ne quitte jamais le fournisseur.
 */

export interface PortefeuilleProvisionne {
  walletId: string;
  adresse: string;
}

export interface Patience {
  tentatives?: number;
  delaiMs?: number;
  attendre?: (ms: number) => Promise<void>;
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Cree le portefeuille et rend son adresse.
 *
 * L'adresse peut manquer dans la reponse immediate : la creation d'une cle est
 * asynchrone chez le fournisseur. On relit donc le portefeuille plutot que
 * d'echouer d'emblee, ce qui laisserait un portefeuille cree et orphelin,
 * facture et introuvable. Au bout des tentatives, on echoue en le NOMMANT,
 * pour qu'il puisse etre repris ou archive.
 */
export async function provisionner(
  client: DfnsApiClient,
  nom: string,
  patience: Patience = {},
): Promise<PortefeuilleProvisionne> {
  const { tentatives = 10, delaiMs = 1000, attendre = dormir } = patience;

  const cree = await client.wallets.createWallet({
    body: { network: RESEAU, name: nom },
  });
  if (cree.address) return { walletId: cree.id, adresse: cree.address };

  for (let i = 0; i < tentatives; i += 1) {
    await attendre(delaiMs);
    const relu = await client.wallets.getWallet({ walletId: cree.id });
    if (relu.address) return { walletId: cree.id, adresse: relu.address };
  }

  throw new Error(
    `le portefeuille ${cree.id} a ete cree mais n'a toujours pas d'adresse ` +
      `apres ${tentatives} relectures. Il existe : le reprendre ou l'archiver.`,
  );
}
