import { describe, expect, it } from "vitest";
import { chargerConfig, ConfigError, viseLeMainnet } from "../src/config.js";

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
