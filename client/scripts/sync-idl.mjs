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

let derive = false;
for (const nom of programmes) {
  const source = join(racine, "target", "idl", `${nom}.json`);
  const cible = join(ici, "..", "idl", `${nom}.json`);
  if (!existsSync(source)) {
    console.error(`IDL absent : ${source}. Lancer \`anchor build\` d'abord.`);
    process.exit(1);
  }
  const attendu = readFileSync(source, "utf8");
  if (verifie) {
    const present = existsSync(cible) ? readFileSync(cible, "utf8") : "";
    if (present !== attendu) {
      console.error(`IDL derive : ${nom}. Lancer \`npm run sync:idl\`.`);
      derive = true;
    }
  } else {
    writeFileSync(cible, attendu);
    console.log(`IDL synchronise : ${nom}`);
  }
}
process.exit(derive ? 1 : 0);
