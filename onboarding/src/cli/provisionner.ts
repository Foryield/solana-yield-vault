import { RESEAU, chargerGarde } from "../config.js";
import { clientDeGarde } from "../dfns.js";
import { provisionner } from "../provisionner.js";
import { lancer } from "./sortie.js";

/**
 * usage : npm run provisionner -- <identifiant>
 *
 * L'identifiant sert de nom au portefeuille. Dans cette demonstration c'est une
 * adresse de courriel brute : ne pas transporter ce choix vers un usage reel
 * sans traiter ce nom comme une donnee personnelle.
 */
lancer(async (env, [identifiant]) => {
  if (!identifiant) throw new Error("usage : provisionner <identifiant>");
  const client = clientDeGarde(chargerGarde(env));
  const portefeuille = await provisionner(client, identifiant);
  // Le reseau est imprime avec le resultat : une preuve nomme son
  // environnement, comme elle nomme son cluster.
  return { resultat: { identifiant, reseau: RESEAU, ...portefeuille } };
});
