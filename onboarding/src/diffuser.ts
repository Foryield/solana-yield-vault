import type { DfnsApiClient } from "@dfns/sdk";

/**
 * Quatrieme brique : faire signer, diffuser, puis constater.
 *
 * Le fournisseur signe et diffuse : nous ne voyons jamais la cle, et il ne voit
 * jamais nos programmes. La frontiere est nette.
 *
 * Deux attentes se suivent, et elles ne portent pas sur la meme chose : la
 * premiere attend que la GARDE ait diffuse, la seconde que le RESEAU ait
 * inclus. Les confondre ferait prendre une demande en cours d'approbation pour
 * une transaction perdue.
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

/**
 * UNE DEMANDE DE DIFFUSION EST ASYNCHRONE, et le supposer synchrone etait une
 * erreur. Les statuts que le fournisseur peut rendre sont, d'apres ses propres
 * types : `Pending`, `Executing`, `Broadcasted`, `Confirmed`, `Failed`,
 * `Rejected`. Les deux premiers sont des etats de passage parfaitement
 * normaux, et ils deviendront la regle le jour ou une politique d'approbation
 * encadrera les diffusions.
 *
 * Exiger `Broadcasted` des la reponse initiale aurait donc echoue sur un
 * fonctionnement nominal, en accusant la garde de ne pas avoir diffuse. On
 * relit la demande jusqu'a un etat terminal.
 */
const EN_COURS = ["Pending", "Executing"];
const DIFFUSEE = ["Broadcasted", "Confirmed"];

const dormirDiffusion = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));

export interface PatienceDiffusion {
  tentatives?: number;
  delaiMs?: number;
  attendre?: (ms: number) => Promise<void>;
}

export async function diffuser(
  client: DfnsApiClient,
  walletId: string,
  hex: string,
  patience: PatienceDiffusion = {},
): Promise<Diffusion> {
  const {
    tentatives = 30,
    delaiMs = 2000,
    attendre = dormirDiffusion,
  } = patience;

  let demande = await client.wallets.broadcastTransaction({
    walletId,
    body: { kind: "Transaction", transaction: hex },
  });

  for (let i = 0; i < tentatives; i += 1) {
    if (DIFFUSEE.includes(demande.status)) {
      // Le SDK type l'empreinte comme facultative meme diffusee. Sans elle,
      // rien a suivre on-chain : le dire plutot que rendre un resultat vide.
      if (!demande.txHash) {
        throw new Error(
          `la garde annonce ${demande.status} sans empreinte de transaction ` +
            `(demande ${demande.id})`,
        );
      }
      return {
        requestId: demande.id,
        statut: demande.status,
        signature: demande.txHash,
      };
    }

    if (!EN_COURS.includes(demande.status)) {
      const motif = demande.reason ? ` motif=${demande.reason}` : "";
      throw new Error(
        `la garde n'a pas diffuse : statut=${demande.status}${motif} ` +
          `(demande ${demande.id})`,
      );
    }

    await attendre(delaiMs);
    demande = await client.wallets.getTransaction({
      walletId,
      transactionId: demande.id,
    });
  }

  throw new Error(
    `la demande ${demande.id} est restee en ${demande.status} apres ` +
      `${tentatives} relectures. Une approbation est peut-etre en attente.`,
  );
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
