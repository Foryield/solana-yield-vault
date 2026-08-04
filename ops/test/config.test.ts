import { describe, expect, it } from "vitest";
import {
  chargerConfig,
  ConfigError,
  exigeAllocateur,
  viseLeMainnet,
} from "../src/config.js";

/**
 * Ces tests portent sur le refus, pas sur le succes. La ligne de commande
 * signe avec une cle reelle : ce qui doit etre verrouille, c'est ce qu'elle
 * REFUSE de faire quand on ne lui a rien dit.
 */

const complet = {
  SOLANA_RPC_URL: "https://api.devnet.solana.com",
  VAULT_PROGRAM_ID: "2bkjZG8njXHQ1tdj5aRSiwjjndX1qEvjFYzBYJQjNysw",
  HOOK_PROGRAM_ID: "EGbJBdCUK5ecUiVJ9FFiGdVEZQ15cE31zNm97RUpFK63",
  SOLANA_KEYPAIR: "/tmp/cle.json",
};

describe("rien n'est deduit", () => {
  for (const manquant of Object.keys(complet)) {
    it(`refuse sans ${manquant}`, () => {
      const env = { ...complet, [manquant]: undefined };
      expect(() => chargerConfig(env)).toThrow(ConfigError);
    });
  }

  it("refuse un identifiant de programme qui n'est pas une cle", () => {
    expect(() =>
      chargerConfig({ ...complet, VAULT_PROGRAM_ID: "pas-une-cle" }),
    ).toThrow(/cle publique valide/);
  });

  it("accepte une configuration complete sur devnet", () => {
    const c = chargerConfig(complet);
    expect(c.estMainnet).toBe(false);
    expect(c.vaultProgramId.toBase58()).toBe(complet.VAULT_PROGRAM_ID);
  });
});

describe("l'allocateur est facultatif, mais pas devinable", () => {
  const ALLOCATEUR = "BjQJMxT5m4wb6nLBnA91s446hTsj1AL9RiwxVEk2rgGr";

  /**
   * Son absence ne doit pas empecher d'administrer un coffre : l'allocateur
   * n'est pas deploye partout ou le coffre l'est. Ce test dit que la
   * configuration reste chargeable sans lui.
   */
  it("se charge sans ALLOCATOR_PROGRAM_ID", () => {
    expect(chargerConfig(complet).allocatorProgramId).toBeNull();
  });

  it("le lit quand il est pose", () => {
    const c = chargerConfig({ ...complet, ALLOCATOR_PROGRAM_ID: ALLOCATEUR });
    expect(c.allocatorProgramId?.toBase58()).toBe(ALLOCATEUR);
  });

  /** Une variable posee mais vide est une variable absente, pas une cle vide. */
  it("traite une valeur vide comme une absence", () => {
    expect(
      chargerConfig({ ...complet, ALLOCATOR_PROGRAM_ID: "   " }).allocatorProgramId,
    ).toBeNull();
  });

  it("refuse une valeur qui n'est pas une cle", () => {
    expect(() =>
      chargerConfig({ ...complet, ALLOCATOR_PROGRAM_ID: "pas-une-cle" }),
    ).toThrow(/cle publique valide/);
  });

  /**
   * LE REFUS QUI COMPTE. Une commande de venue sans allocateur doit s'arreter
   * en nommant la variable, et non echouer plus loin sur un compte introuvable.
   */
  it("refuse une commande de venue sans allocateur", () => {
    expect(() => exigeAllocateur(chargerConfig(complet))).toThrow(
      /ALLOCATOR_PROGRAM_ID/,
    );
  });

  it("le rend quand il est pose", () => {
    const c = chargerConfig({ ...complet, ALLOCATOR_PROGRAM_ID: ALLOCATEUR });
    expect(exigeAllocateur(c).toBase58()).toBe(ALLOCATEUR);
  });
});

describe("viser le mainnet doit etre un geste conscient", () => {
  // Le CLI Solana pointe par defaut sur le mainnet. Une commande
  // d'administration qui heriterait de cette configuration depenserait du SOL
  // reel sur un geste qu'on croyait de test.
  const mainnet = { ...complet, SOLANA_RPC_URL: "https://api.mainnet-beta.solana.com" };

  it("refuse le mainnet sans confirmation explicite", () => {
    expect(() => chargerConfig(mainnet)).toThrow(/JE_VISE_LE_MAINNET/);
  });

  it("l'accepte avec la confirmation", () => {
    const c = chargerConfig({ ...mainnet, JE_VISE_LE_MAINNET: "oui" });
    expect(c.estMainnet).toBe(true);
  });

  it("une confirmation approximative ne suffit pas", () => {
    expect(() =>
      chargerConfig({ ...mainnet, JE_VISE_LE_MAINNET: "true" }),
    ).toThrow(/JE_VISE_LE_MAINNET/);
  });

  it("reconnait le mainnet a son hote, pas a une promesse", () => {
    expect(viseLeMainnet("https://api.mainnet-beta.solana.com")).toBe(true);
    expect(viseLeMainnet("https://MAINNET.example.com")).toBe(true);
    expect(viseLeMainnet("https://api.devnet.solana.com")).toBe(false);
  });
});
