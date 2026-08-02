import { PublicKey } from "@solana/web3.js";
import { adressesDuCoffre } from "@foryield/solana-yield-vault-client";
import { chargerConfig, chargerTresorerie } from "../config.js";
import {
  chargerCle,
  connexion,
  decimalesDuMint,
  envoyer,
  programmeDuCoffre,
  programmeDuMint,
} from "../chaine.js";
import {
  LAMPORTS_PAR_DEFAUT,
  comptesDuPorteur,
  instructionsDeDotation,
} from "../financer.js";
import { lancer } from "./sortie.js";

/**
 * usage : npm run financer -- <adresse> [actif-en-unites] [lamports]
 *
 * Signe avec la cle de tresorerie, la seule cle que nous tenions. Le montant
 * est en unites minimales, comme partout dans ce depot : un flottant n'entre
 * jamais dans un montant.
 */
lancer(async (env, [adresseStr, actifStr, lamportsStr]) => {
  if (!adresseStr) {
    throw new Error("usage : financer <adresse> [actif-en-unites] [lamports]");
  }
  const config = chargerConfig(env);
  const tresorerie = chargerTresorerie(env);
  const beneficiaire = new PublicKey(adresseStr);

  const connection = await connexion(config);
  const cle = chargerCle(tresorerie.keypairPath);
  const programmeDeLActif = await programmeDuMint(connection, config.depositMint);
  const decimalesDeLActif = await decimalesDuMint(
    connection,
    config.depositMint,
    programmeDeLActif,
  );
  const { sharesMint } = adressesDuCoffre({
    program: programmeDuCoffre(config, connection),
    depositMint: config.depositMint,
    depositTokenProgram: programmeDeLActif,
  });

  const lamports = lamportsStr ? BigInt(lamportsStr) : LAMPORTS_PAR_DEFAUT;
  const actif = BigInt(actifStr ?? "500000");

  const signature = await envoyer(
    connection,
    cle,
    instructionsDeDotation({
      payeur: cle.publicKey,
      beneficiaire,
      depositMint: config.depositMint,
      programmeDeLActif,
      sharesMint,
      decimalesDeLActif,
      lamports,
      actif,
    }),
  );

  const comptes = comptesDuPorteur(
    beneficiaire,
    config.depositMint,
    programmeDeLActif,
    sharesMint,
  );
  return {
    resultat: {
      beneficiaire: adresseStr,
      lamports: lamports.toString(),
      actif: actif.toString(),
      comptes: {
        actif: comptes.actif.toBase58(),
        parts: comptes.parts.toBase58(),
      },
      signature,
    },
  };
});
