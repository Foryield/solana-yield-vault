import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import venue from "./fixtures/jupiter-lend-devnet.json" with { type: "json" };
import allocatorFixture from "./fixtures/allocator-addresses.json" with { type: "json" };
import {
  PROGRAMMES_JUPITER_LEND_DEVNET,
  comptesDeLaVenue,
  compteDeReclamationAddress,
  marcheAddress,
} from "../src/venues/jupiterLend.js";
import { positionAddress } from "../src/addresses.js";

/**
 * Ces tests confrontent DEUX ORIGINES qui n'ont rien en commun.
 *
 * D'un cote la fixture, RELEVEE sur devnet par `scripts/releve-venue.mjs`, qui
 * ne derive rien : elle lit les octets d'un compte de marche et demande a la
 * chaine le proprietaire des comptes que ce marche designe. De l'autre nos
 * derivations, calculees a partir des seules graines du paquet de l'editeur.
 *
 * Rien ne garantissait que ces graines, publiees pour le mainnet, vaillent
 * aussi pour devnet. C'est ce que ces tests etablissent, plutot que de le
 * supposer parce que ca paraissait probable.
 */

describe("programmes de la venue sur devnet", () => {
  it("sont ceux que la chaine designe, et non ceux du paquet", () => {
    expect(PROGRAMMES_JUPITER_LEND_DEVNET.pret.toBase58()).toBe(venue.programmes.pret);
    expect(PROGRAMMES_JUPITER_LEND_DEVNET.liquidite.toBase58()).toBe(
      venue.programmes.liquidite,
    );
    expect(PROGRAMMES_JUPITER_LEND_DEVNET.recompenses.toBase58()).toBe(
      venue.programmes.recompenses,
    );
  });

  /**
   * LE PIEGE QUE CE DEPOT A DEJA PAYE UNE FOIS. Le paquet de l'editeur code en
   * dur les adresses du mainnet, absentes de devnet. Les figer ici comme
   * valeurs INTERDITES fait tomber le test si quelqu'un les recopie.
   */
  it("ne sont pas les adresses mainnet du paquet de l'editeur", () => {
    const mainnet = [
      "jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9",
      "jupeiUmn818Jg1ekPURTpr4mFo29p46vygyykFJ3wZC",
      "jup7TthsMgcR9Y3L277b8Eo9uboVSmu1utkuXHNUKar",
    ];
    for (const p of Object.values(PROGRAMMES_JUPITER_LEND_DEVNET)) {
      expect(mainnet).not.toContain(p.toBase58());
    }
  });
});

describe("comptes de la venue", () => {
  const actif = new PublicKey(venue.actif);
  const programmeDeJeton = new PublicKey(venue.programmeDeJeton);
  const c = comptesDeLaVenue(PROGRAMMES_JUPITER_LEND_DEVNET, actif, programmeDeJeton);

  it("derive le marche que la chaine porte", () => {
    expect(c.marche.toBase58()).toBe(venue.comptes.marche);
  });

  it("derive le jeton de recu que le marche declare", () => {
    expect(c.jetonDeRecu.toBase58()).toBe(venue.comptes.jetonDeRecu);
  });

  it("derive les reserves que le marche designe", () => {
    expect(c.reserves.toBase58()).toBe(venue.comptes.reserves);
  });

  it("derive la position de liquidite que le marche designe", () => {
    expect(c.positionDeLiquidite.toBase58()).toBe(venue.comptes.positionDeLiquidite);
  });

  it("derive le modele de recompenses que le marche designe", () => {
    expect(c.modeleDeRecompenses.toBase58()).toBe(venue.comptes.modeleDeRecompenses);
  });

  /**
   * La derivation du marche passe PAR celle du jeton de recu. Un actif
   * different doit donc donner un marche different, sans quoi la chaine de
   * derivation ignorerait son entree.
   */
  it("derive un marche different par actif", () => {
    const autre = new PublicKey(allocatorFixture.coffre);
    expect(marcheAddress(PROGRAMMES_JUPITER_LEND_DEVNET, autre).toBase58()).not.toBe(
      venue.comptes.marche,
    );
  });

  /**
   * LE COMPTE DE RECLAMATION NE DEPEND PAS DU RETIREUR, malgre une graine qui
   * dit « user » : il est derive de l'administration de la venue. C'est ce qui
   * fait qu'il en existe un seul par actif, et que celui du marche vise existe
   * deja. Le test fige cette propriete, dont depend un prealable
   * d'exploitation.
   */
  it("derive un compte de reclamation qui ne depend pas du retireur", () => {
    const pourUnAutreActif = compteDeReclamationAddress(
      PROGRAMMES_JUPITER_LEND_DEVNET,
      new PublicKey(allocatorFixture.coffre),
    );
    expect(c.compteDeReclamation.toBase58()).not.toBe(pourUnAutreActif.toBase58());
    // Deux appels pour le meme actif rendent la meme adresse : rien d'autre
    // que l'actif n'entre dans cette derivation.
    expect(
      compteDeReclamationAddress(PROGRAMMES_JUPITER_LEND_DEVNET, actif).toBase58(),
    ).toBe(c.compteDeReclamation.toBase58());
  });
});

describe("autorite de position de l'allocateur", () => {
  it("derive la meme adresse que le programme", () => {
    const position = positionAddress(
      new PublicKey(allocatorFixture.programId),
      new PublicKey(allocatorFixture.coffre),
      new PublicKey(allocatorFixture.marche),
    );
    expect(position.toBase58()).toBe(allocatorFixture.position);
  });

  /**
   * Une position par couple coffre et marche. Changer l'un ou l'autre doit
   * changer l'adresse, sans quoi l'isolation par venue serait une illusion.
   */
  it("change avec le coffre comme avec le marche", () => {
    const programId = new PublicKey(allocatorFixture.programId);
    const coffre = new PublicKey(allocatorFixture.coffre);
    const marche = new PublicKey(allocatorFixture.marche);
    const autre = new PublicKey(venue.comptes.jetonDeRecu);

    expect(positionAddress(programId, autre, marche).toBase58()).not.toBe(
      allocatorFixture.position,
    );
    expect(positionAddress(programId, coffre, autre).toBase58()).not.toBe(
      allocatorFixture.position,
    );
  });
});
