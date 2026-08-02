import { PublicKey } from "@solana/web3.js";
import { chargerConfig } from "../config.js";
import { connexion, programmeDuCoffre, programmeDuMint } from "../chaine.js";
import { enveloppeDeDepot } from "../enveloppe.js";
import { lancer } from "./sortie.js";

/**
 * usage : npm run enveloppe -- <adresse-du-deposant> <montant-en-unites>
 *
 * AUCUN IDENTIFIANT DE GARDE N'EST LU ICI, et c'est deliberer : composer une
 * transaction ne demande aucun pouvoir de signature. Un dorsal peut appeler
 * cette brique sans jamais tenir la moindre valeur secrete.
 *
 * L'empreinte de bloc obtenue ici expire en quelques dizaines de secondes :
 * diffuser sans tarder, ou reconstruire.
 */
lancer(async (env, [deposantStr, montantStr]) => {
  if (!deposantStr || !montantStr) {
    throw new Error("usage : enveloppe <adresse-du-deposant> <montant-en-unites>");
  }
  const config = chargerConfig(env);
  const deposant = new PublicKey(deposantStr);

  const connection = await connexion(config);
  const programmeDeLActif = await programmeDuMint(connection, config.depositMint);
  const empreinte = await connection.getLatestBlockhash("confirmed");

  const enveloppe = await enveloppeDeDepot({
    program: programmeDuCoffre(config, connection),
    depositMint: config.depositMint,
    programmeDeLActif,
    deposant,
    montant: BigInt(montantStr),
    empreinte,
  });

  return {
    resultat: {
      deposant: deposantStr,
      montant: montantStr,
      empreinteDeBloc: empreinte.blockhash,
      ...enveloppe,
    },
  };
});
