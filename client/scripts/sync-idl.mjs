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
  const cible = join(ici, "..", "src", "idl", `${nom}.json`);
  if (!existsSync(source)) {
    console.error(`IDL absent : ${source}. Lancer \`anchor build\` d'abord.`);
    process.exit(1);
  }
  const brut = JSON.parse(readFileSync(source, "utf8"));

  // L'ADRESSE EST RETIREE, elle n'appartient pas a l'interface.
  //
  // Sur une copie fraiche, `anchor build` fabrique de nouvelles paires de cles
  // de programme (ignorees par git, a juste titre) puis REECRIT tout ce qui
  // porte un identifiant pour s'y aligner : Anchor.toml et le `declare_id!`
  // des sources. Il n'existe donc aucune source stable dans l'arbre de travail
  // APRES un build. Deux tentatives de lecture ont echoue avant celle-ci.
  //
  // Plutot que de chercher une quatrieme source, on constate que ce champ ne
  // fait pas partie de ce qu'on veut figer : l'interface d'un programme, ce
  // sont ses instructions, ses comptes et ses erreurs. L'adresse depend du
  // deploiement, elle est consignee dans docs/evidence, et le client la recoit
  // explicitement.
  delete brut.address;

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
// --- Types TypeScript generes par Anchor ---------------------------------
//
// Meme traitement, meme raison : ils portent l'adresse en type litteral, donc
// la meme valeur dependante de la machine. Elle est neutralisee ; le client
// injecte la vraie a la construction.
const ADRESSE_NEUTRE = "11111111111111111111111111111111";
for (const nom of programmes) {
  const source = join(racine, "target", "types", `${nom}.ts`);
  const cible = join(ici, "..", "src", "idl", `${nom}.ts`);
  if (!existsSync(source)) {
    console.error(`types absents : ${source}. Lancer \`anchor build\` d'abord.`);
    process.exit(1);
  }
  const attendu = readFileSync(source, "utf8").replace(
    /"address": "[1-9A-HJ-NP-Za-km-z]+"/,
    `"address": "${ADRESSE_NEUTRE}"`,
  );
  if (verifie) {
    const present = existsSync(cible) ? readFileSync(cible, "utf8") : "";
    if (present !== attendu) {
      console.error(`Types derives : ${nom}. Lancer \`npm run sync:idl\`.`);
      derive = true;
    }
  } else {
    writeFileSync(cible, attendu);
    console.log(`Types synchronises : ${nom}`);
  }
}

process.exit(derive ? 1 : 0);
