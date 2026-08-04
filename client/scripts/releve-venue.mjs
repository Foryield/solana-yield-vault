/**
 * Releve sur la chaine les comptes de la venue de pret, et n'en derive AUCUN.
 *
 * C'est la moitie « mesure » d'une confrontation. La moitie « calcul » vit dans
 * `src/venues/jupiterLend.ts`, qui derive les memes adresses depuis les graines
 * du paquet de l'editeur. Le test compare les deux. Si ce script derivait quoi
 * que ce soit, la comparaison serait circulaire et ne prouverait rien.
 *
 * Tout ce qui est ecrit ici est donc LU : les champs sont extraits des octets du
 * compte de marche, et les identifiants de programme sont les PROPRIETAIRES des
 * comptes que ce marche designe. C'est ainsi que les identifiants devnet ont ete
 * trouves, le paquet de l'editeur ne portant que ceux du mainnet.
 *
 * Usage : node scripts/releve-venue.mjs [url-rpc] [marche]
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Connection, PublicKey } from "@solana/web3.js";

const ici = dirname(fileURLToPath(import.meta.url));
const cible = join(ici, "..", "test", "fixtures", "jupiter-lend-devnet.json");

const url = process.argv[2] ?? "https://api.devnet.solana.com";
const marche = new PublicKey(
  process.argv[3] ?? "98Uy7eonumvRbhQvP5Jt7B3WjNqpndioMF99xvR7sDVa",
);

/**
 * Decalages de la structure `Lending`, etablis par trois sources concordantes
 * et repris tels quels de `programs/allocator/src/venues/jupiter_lend/lending.rs`.
 * Les deux champs de fin ne sont pas exposes cote Rust, faute d'emploi ; ils le
 * sont ici parce qu'ils portent les temoins de deux derivations.
 */
const cle = (octets, debut) => new PublicKey(octets.subarray(debut, debut + 32));

const connection = new Connection(url, "confirmed");

const compteDuMarche = await connection.getAccountInfo(marche);
if (!compteDuMarche) {
  console.error(`marche introuvable sur ${url} : ${marche.toBase58()}`);
  process.exit(1);
}
const d = compteDuMarche.data;
if (d.length !== 196) {
  console.error(`taille inattendue pour un marche : ${d.length}, attendu 196`);
  process.exit(1);
}

const actif = cle(d, 8);
const jetonDeRecu = cle(d, 40);
const modeleDeRecompenses = cle(d, 75);
const reserves = cle(d, 131);
const positionDeLiquidite = cle(d, 163);

// LES IDENTIFIANTS DE PROGRAMME SONT DES PROPRIETAIRES DE COMPTE, jamais des
// constantes recopiees. Le marche appartient au programme de pret, ses reserves
// au programme de liquidite, son modele de recompenses au troisieme.
const [compteDesReserves, compteDuModele] = await Promise.all([
  connection.getAccountInfo(reserves),
  connection.getAccountInfo(modeleDeRecompenses),
]);
if (!compteDesReserves || !compteDuModele) {
  console.error("reserves ou modele de recompenses introuvable : releve impossible");
  process.exit(1);
}

const compteDuJeton = await connection.getAccountInfo(actif);
if (!compteDuJeton) {
  console.error("mint de l'actif introuvable");
  process.exit(1);
}

const releve = {
  _lu: "Releve sur la chaine, aucune adresse derivee. Voir l'en-tete du script.",
  rpcUrl: url,
  programmes: {
    pret: compteDuMarche.owner.toBase58(),
    liquidite: compteDesReserves.owner.toBase58(),
    recompenses: compteDuModele.owner.toBase58(),
  },
  actif: actif.toBase58(),
  programmeDeJeton: compteDuJeton.owner.toBase58(),
  comptes: {
    marche: marche.toBase58(),
    jetonDeRecu: jetonDeRecu.toBase58(),
    modeleDeRecompenses: modeleDeRecompenses.toBase58(),
    reserves: reserves.toBase58(),
    positionDeLiquidite: positionDeLiquidite.toBase58(),
  },
};

writeFileSync(cible, `${JSON.stringify(releve, null, 2)}\n`);
console.error(`releve ecrit dans ${cible}`);
