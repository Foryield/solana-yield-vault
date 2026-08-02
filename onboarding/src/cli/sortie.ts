import { chargerFichier } from "../env.js";
import { ConfigError } from "../config.js";

/**
 * Forme commune des cinq commandes : une ligne JSON sur la sortie standard,
 * les erreurs sur la sortie d'erreur, un code de sortie qui distingue les cas.
 *
 * C'est ce qui rend chaque brique appelable en sous-processus depuis n'importe
 * quel dorsal, quel que soit son langage. Un dorsal qui lit du JSON melange a
 * des messages d'avancement ne lit rien du tout.
 *
 * Codes : 0 succes, 1 erreur, 2 transaction incluse mais en echec on-chain. Le
 * 2 existe parce qu'un depot refuse par une regle n'est PAS une panne, et le
 * resume est imprime quand meme.
 */

export interface Issue {
  resultat: unknown;
  code?: number;
}

export type Commande = (
  env: Record<string, string | undefined>,
  args: string[],
) => Promise<Issue>;

export function lancer(commande: Commande): void {
  // Les identifiants viennent d'un fichier resolu HORS du depot. Une variable
  // deja exportee l'emporte sur le fichier.
  chargerFichier();

  commande(process.env, process.argv.slice(2))
    .then(({ resultat, code = 0 }) => {
      // Ecriture puis sortie dans le rappel : sortir avant que la sortie
      // standard soit vidangee tronquerait la ligne JSON quand elle est lue par
      // un tube, ce qui est exactement le cas d'usage vise.
      process.stdout.write(`${JSON.stringify(resultat)}\n`, () => {
        process.exit(code);
      });
    })
    .catch((e) => {
      if (e instanceof ConfigError) {
        console.error(`configuration : ${e.message}`);
      } else {
        const message = e instanceof Error ? e.message : String(e);
        console.error(message);
        // LES JOURNAUX DU PROGRAMME, quand le message ne les porte pas deja.
        // Un refus dont on ne lit pas le code ne prouve rien.
        const journaux = (e as { logs?: string[] }).logs;
        if (journaux?.length && !message.includes(journaux[0]!)) {
          console.error(journaux.join("\n"));
        }
      }
      process.exit(1);
    });
}
