import { PublicKey } from "@solana/web3.js";
import { adressesDuCoffre } from "@foryield/solana-yield-vault-client";
import {
  RESEAU,
  chargerConfig,
  chargerGarde,
  chargerTresorerie,
  lienTransaction,
} from "../config.js";
import {
  chargerCle,
  connexion,
  decimalesDuMint,
  envoyer,
  programmeDuCoffre,
  programmeDuMint,
} from "../chaine.js";
import { clientDeGarde } from "../dfns.js";
import { provisionner } from "../provisionner.js";
import { LAMPORTS_PAR_DEFAUT, instructionsDeDotation } from "../financer.js";
import { enveloppeDeDepot } from "../enveloppe.js";
import { attendreConfirmation, diffuser } from "../diffuser.js";
import { parcours } from "../parcours.js";
import { lancer } from "./sortie.js";

/**
 * usage : npm run parcours -- <identifiant> [montant-en-unites]
 *
 * La chaine entiere, d'un identifiant a une transaction confirmee. C'est cette
 * commande qui rend le verdict du spike S5.
 *
 * Tout ce qui peut etre resolu avant de commencer l'est ici : programme de
 * l'actif, decimales, adresse du mint des parts. L'orchestrateur n'a plus qu'a
 * enchainer, et l'enveloppe se construit au dernier moment, avec une empreinte
 * de bloc fraiche.
 */
lancer(async (env, [identifiant, montantStr]) => {
  if (!identifiant) throw new Error("usage : parcours <identifiant> [montant-en-unites]");
  const config = chargerConfig(env);
  const client = clientDeGarde(chargerGarde(env));
  const tresorerie = chargerTresorerie(env);
  const montant = BigInt(montantStr ?? "500000");

  const connection = await connexion(config);
  const cle = chargerCle(tresorerie.keypairPath);
  const programmeDeLActif = await programmeDuMint(connection, config.depositMint);
  const decimalesDeLActif = await decimalesDuMint(
    connection,
    config.depositMint,
    programmeDeLActif,
  );
  const program = programmeDuCoffre(config, connection);
  const { sharesMint } = adressesDuCoffre({
    program,
    depositMint: config.depositMint,
    depositTokenProgram: programmeDeLActif,
  });

  const resume = await parcours(identifiant, {
    provisionner: (nom) => provisionner(client, nom),

    // La dotation porte exactement ce qui sera depose : le portefeuille ne
    // conserve rien de l'actif, ce qui rend le resultat lisible.
    financer: (adresse) =>
      envoyer(
        connection,
        cle,
        instructionsDeDotation({
          payeur: cle.publicKey,
          beneficiaire: new PublicKey(adresse),
          depositMint: config.depositMint,
          programmeDeLActif,
          sharesMint,
          decimalesDeLActif,
          lamports: LAMPORTS_PAR_DEFAUT,
          actif: montant,
        }),
      ),

    enveloppe: async (deposant) =>
      (
        await enveloppeDeDepot({
          program,
          depositMint: config.depositMint,
          programmeDeLActif,
          deposant: new PublicKey(deposant),
          montant,
          empreinte: await connection.getLatestBlockhash("confirmed"),
        })
      ).hex,

    diffuser: async (walletId, hex) =>
      (await diffuser(client, walletId, hex)).signature,

    confirmer: (signature) => attendreConfirmation(connection, signature),
  });

  return {
    resultat: {
      ...resume,
      reseau: RESEAU,
      montant: montant.toString(),
      lien: lienTransaction(resume.signature),
    },
    code: resume.aboutie ? 0 : 2,
  };
});
