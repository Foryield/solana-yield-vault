import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Ou vivent les identifiants du fournisseur de garde : HORS DE CE DEPOT.
 *
 * Ce depot est public, et ces valeurs sont un jeton de compte de service et une
 * cle de signature. Un fichier d'identifiants pose dans l'arbre de travail est
 * a un `git add -f`, a une regression de `.gitignore` ou a une archive de
 * repertoire de sa publication, et aucun crochet local ne couvre les trois. Le
 * ranger sous le repertoire de configuration de l'utilisateur supprime la
 * classe d'accident entiere au lieu de la detecter apres coup.
 *
 * Ce n'est pas une precaution theorique : un depot voisin a du la prendre
 * APRES avoir heberge une cle. Ici elle est prise avant.
 *
 * `ONBOARDING_ENV_FILE` deplace le fichier. Il n'y a deliberement AUCUN repli
 * vers un `.env` local : un repli restaurerait le risque en silence.
 */
export function fichierParDefaut(): string {
  return (
    process.env["ONBOARDING_ENV_FILE"] ??
    path.join(homedir(), ".config", "foryield", "solana-onboarding.env")
  );
}

/**
 * Lecteur minimal de fichier d'environnement : aucune dependance, et aucune
 * cle ni valeur journalisee. Une variable deja exportee l'emporte toujours sur
 * le fichier.
 */
export function chargerFichier(chemin: string = fichierParDefaut()): void {
  let contenu: string;
  try {
    contenu = readFileSync(chemin, "utf8");
  } catch (e) {
    // L'absence de fichier est une configuration valide : tout peut venir de
    // variables exportees.
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
    throw e;
  }

  for (const ligne of contenu.split("\n")) {
    const propre = ligne.trim();
    if (propre === "" || propre.startsWith("#")) continue;
    const egal = propre.indexOf("=");
    if (egal <= 0) continue;
    const cle = propre.slice(0, egal).trim();
    let valeur = propre.slice(egal + 1).trim();
    if (valeur.length >= 2 && valeur.startsWith('"') && valeur.endsWith('"')) {
      // Forme entre guillemets : une cle PEM tient sur une ligne grace aux
      // echappements litteraux.
      valeur = valeur.slice(1, -1).replaceAll("\\n", "\n");
    }
    if (process.env[cle] === undefined) process.env[cle] = valeur;
  }
}
