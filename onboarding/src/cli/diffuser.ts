import { RESEAU, chargerConfig, chargerGarde, lienTransaction } from "../config.js";
import { connexion } from "../chaine.js";
import { clientDeGarde } from "../dfns.js";
import { attendreConfirmation, diffuser } from "../diffuser.js";
import { lancer } from "./sortie.js";

/**
 * usage : npm run diffuser -- <walletId> <transaction-hex>
 *
 * Sort en code 2 si la transaction a ete incluse mais a echoue a l'execution.
 * C'est le cas d'un depot refuse par une regle du programme : la chaine a tenu,
 * le geste a ete refuse, et confondre les deux ferait passer une regle
 * appliquee pour une panne.
 */
lancer(async (env, [walletId, hex]) => {
  if (!walletId || !hex) throw new Error("usage : diffuser <walletId> <transaction-hex>");
  const config = chargerConfig(env);
  const client = clientDeGarde(chargerGarde(env));

  const connection = await connexion(config);
  const diffusion = await diffuser(client, walletId, hex);
  const confirmation = await attendreConfirmation(connection, diffusion.signature);

  return {
    resultat: {
      walletId,
      reseau: RESEAU,
      ...diffusion,
      slot: confirmation.slot,
      aboutie: confirmation.aboutie,
      erreur: confirmation.erreur,
      lien: lienTransaction(diffusion.signature),
    },
    code: confirmation.aboutie ? 0 : 2,
  };
});
