// Copie les IDL produits par `anchor build` dans le paquet client, ou verifie
// qu'ils n'ont pas derive.
//
// Les IDL sont COMMIS parce qu'un paquet consomme par un navigateur ne peut pas
// lire `target/`, qui est ignore par git. Mais un fichier commis derive : le
// mode `--check` echoue si le depot ne correspond plus aux programmes, et la CI
// l'exerce. Meme motif que le job « Versions alignees ».
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ici = dirname(fileURLToPath(import.meta.url));
const racine = join(ici, "..", "..");
const programmes = ["yield_vault", "compliance_hook"];
const verifie = process.argv.includes("--check");

/**
 * Identifiants declares dans Anchor.toml, qui est COMMIS et fait donc foi.
 *
 * Necessaire parce que le champ `address` de l'IDL genere depend de la
 * machine : sur une copie fraiche, `anchor build` fabrique de nouvelles paires
 * de cles de programme, celles-ci etant ignorees par git a juste titre, et
 * inscrit leurs identifiants dans l'IDL. Le fichier commis porterait alors une
 * valeur locale, et le controle de derive echouerait sur toute autre machine.
 *
 * On reecrit donc l'adresse depuis la source de verite avant de comparer ou
 * d'ecrire. Corollaire pour le client : ne JAMAIS lire l'identifiant de
 * programme depuis l'IDL, toujours le passer explicitement.
 */
function identifiantsDeclares() {
  const toml = readFileSync(join(racine, "Anchor.toml"), "utf8");
  const section = toml.split("[programs.devnet]")[1] ?? "";
  const ids = {};
  for (const ligne of section.split("\n")) {
    if (ligne.startsWith("[")) break;
    const m = ligne.match(/^\s*([a-z_]+)\s*=\s*"([1-9A-HJ-NP-Za-km-z]+)"/);
    if (m) ids[m[1]] = m[2];
  }
  return ids;
}

const declares = identifiantsDeclares();

let derive = false;
for (const nom of programmes) {
  const source = join(racine, "target", "idl", `${nom}.json`);
  const cible = join(ici, "..", "idl", `${nom}.json`);
  if (!existsSync(source)) {
    console.error(`IDL absent : ${source}. Lancer \`anchor build\` d'abord.`);
    process.exit(1);
  }
  const brut = JSON.parse(readFileSync(source, "utf8"));
  const declare = declares[nom];
  if (!declare) {
    console.error(`identifiant absent d'Anchor.toml pour ${nom}`);
    process.exit(1);
  }
  brut.address = declare;
  const attendu = `${JSON.stringify(brut, null, 2)}\n`;
  if (verifie) {
    const present = existsSync(cible) ? readFileSync(cible, "utf8") : "";
    if (present !== attendu) {
      console.error(`IDL derive : ${nom}. Lancer \`npm run sync:idl\`.`);
      // Un controle qui dit « ca a change » sans dire QUOI fait perdre plus de
      // temps qu'il n'en gagne. On nomme les premieres lignes divergentes.
      const a = present.split("\n");
      const b = attendu.split("\n");
      let montrees = 0;
      for (let i = 0; i < Math.max(a.length, b.length) && montrees < 8; i++) {
        if (a[i] !== b[i]) {
          console.error(`  ligne ${i + 1}`);
          console.error(`    commis : ${JSON.stringify(a[i] ?? "<absente>")}`);
          console.error(`    genere : ${JSON.stringify(b[i] ?? "<absente>")}`);
          montrees++;
        }
      }
      derive = true;
    }
  } else {
    writeFileSync(cible, attendu);
    console.log(`IDL synchronise : ${nom}`);
  }
}
process.exit(derive ? 1 : 0);
