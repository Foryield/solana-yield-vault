import type { DfnsApiClient } from "@dfns/sdk";

/**
 * Quatrieme brique : faire signer, diffuser, puis constater.
 *
 * Le fournisseur signe et diffuse en un appel : nous ne voyons jamais la cle,
 * et il ne voit jamais nos programmes. La frontiere est nette.
 *
 * "Diffuse" n'est pas "inclus". Une transaction acceptee par le fournisseur
 * peut encore expirer, etre rejetee, ou echouer une fois executee. La verite
 * est on-chain, donc la seconde moitie de cette brique interroge le reseau.
 */

export interface Diffusion {
  requestId: string;
  statut: string;
  signature: string;
}

export async function diffuser(
  client: DfnsApiClient,
  walletId: string,
  hex: string,
): Promise<Diffusion> {
  const reponse = await client.wallets.broadcastTransaction({
    walletId,
    body: { kind: "Transaction", transaction: hex },
  });

  // Le SDK type l'empreinte comme facultative meme diffusee. Tout autre statut
  // signifie que la demande est retenue par une politique, rejetee ou en
  // echec : le dire fort plutot que rendre un resultat vide.
  if (reponse.status !== "Broadcasted" || !reponse.txHash) {
    const motif = reponse.reason ? ` motif=${reponse.reason}` : "";
    throw new Error(
      `la garde n'a pas diffuse : statut=${reponse.status}${motif} ` +
        `(demande ${reponse.id})`,
    );
  }
  return {
    requestId: reponse.id,
    statut: reponse.status,
    signature: reponse.txHash,
  };
}

export interface Confirmation {
  signature: string;
  slot: number;
  /** Vrai si la transaction a ete incluse ET s'est executee sans erreur. */
  aboutie: boolean;
  erreur: string | null;
}

/** Ce que le reseau rend pour une signature. Type au plus juste, pour etre simulable. */
export interface StatutBrut {
  slot: number;
  err: unknown;
  confirmationStatus?: string | null;
}

export interface LecteurDeStatut {
  getSignatureStatuses(
    signatures: string[],
    config?: { searchTransactionHistory?: boolean },
  ): Promise<{ value: (StatutBrut | null)[] }>;
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Attend l'inclusion on-chain.
 *
 * Une transaction en echec est CONFIRMEE : elle a bien ete incluse, elle a
 * simplement echoue a l'execution. On rend donc les deux faits separement
 * plutot que de lever une exception, et l'appelant decide. C'est ce qui permet
 * a la ligne de commande de sortir en code 2, distinct d'une panne.
 */
export async function attendreConfirmation(
  lecteur: LecteurDeStatut,
  signature: string,
  options: {
    tentatives?: number;
    delaiMs?: number;
    attendre?: (ms: number) => Promise<void>;
  } = {},
): Promise<Confirmation> {
  const { tentatives = 30, delaiMs = 2000, attendre = dormir } = options;

  for (let i = 0; i < tentatives; i += 1) {
    if (i > 0) await attendre(delaiMs);
    const { value } = await lecteur.getSignatureStatuses([signature], {
      // La transaction peut sortir du cache recent entre deux tentatives.
      searchTransactionHistory: true,
    });
    const statut = value[0];
    if (!statut) continue;
    if (
      statut.confirmationStatus !== "confirmed" &&
      statut.confirmationStatus !== "finalized"
    ) {
      continue;
    }
    return {
      signature,
      slot: statut.slot,
      aboutie: statut.err === null || statut.err === undefined,
      erreur: statut.err ? JSON.stringify(statut.err) : null,
    };
  }

  throw new Error(
    `la transaction ${signature} n'est pas confirmee apres ${tentatives} ` +
      `tentatives. Elle peut avoir expire : l'empreinte de bloc ne vaut que ` +
      `quelques dizaines de secondes.`,
  );
}
