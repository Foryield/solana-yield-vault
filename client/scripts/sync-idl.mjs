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
 * Identifiants declares par `declare_id!` dans les sources des programmes.
 *
 * NE PAS lire Anchor.toml ici, meme s'il est commis : `anchor build` LE
 * REECRIT pour l'aligner sur les paires de cles qu'il vient de generer. Sur une
 * copie fraiche, ces paires sont neuves (elles sont ignorees par git, a juste
 * titre), donc Anchor.toml est mute par le build juste avant qu'on le lise.
 *
 * `declare_id!` dans les sources, lui, n'est touche que par `anchor keys sync`,
 * une commande explicite. C'est la seule source stable, et c'est aussi celle
 * qui determine l'identifiant du binaire compile.
 *
 * Corollaire pour le client : ne JAMAIS lire l'identifiant de programme depuis
 * l'IDL, toujours le passer explicitement.
 */
function identifiantsDeclares() {
  const ids = {};
  for (const nom of programmes) {
    const crate = nom.replace(/_/g, "-");
    const source = join(racine, "programs", crate, "src", "lib.rs");
    const m = readFileSync(source, "utf8").match(
      /declare_id!\("([1-9A-HJ-NP-Za-km-z]+)"\)/,
    );
    if (!m) {
      console.error(`declare_id! introuvable dans ${source}`);
      process.exit(1);
    }
    ids[nom] = m[1];
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
