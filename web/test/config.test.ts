import { describe, expect, it } from "vitest";
import { chargerConfig, ConfigError, viseLeMainnet } from "../lib/config";

/**
 * Memes tests que ceux de la ligne de commande, pour la meme raison : ce qui
 * doit etre verrouille, c'est ce que la page REFUSE d'afficher quand on ne lui
 * a rien dit. Une demonstration qui se rabattrait sur des valeurs par defaut
 * montrerait des soldes faux avec l'aplomb des vrais.
 */

const complet = {
  NEXT_PUBLIC_SOLANA_RPC_URL: "https://api.devnet.solana.com",
  NEXT_PUBLIC_VAULT_PROGRAM_ID: "2bkjZG8njXHQ1tdj5aRSiwjjndX1qEvjFYzBYJQjNysw",
  NEXT_PUBLIC_HOOK_PROGRAM_ID: "EGbJBdCUK5ecUiVJ9FFiGdVEZQ15cE31zNm97RUpFK63",
  NEXT_PUBLIC_DEPOSIT_MINT: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  NEXT_PUBLIC_PORTEUR_AUTORISE: "Dz7mzmQS9YDvDMu9faWms41rfcyUM3vZDRXu9ZNhLgKr",
  NEXT_PUBLIC_PORTEUR_NON_AUTORISE: "BeBQQqjuUFU1qjJayMg46CWuaKw7oTJ5R4UfoVLVKohL",
};

describe("rien n'est deduit", () => {
  for (const manquant of Object.keys(complet)) {
    it(`refuse sans ${manquant}`, () => {
      expect(() =>
        chargerConfig({ ...complet, [manquant]: undefined }),
      ).toThrow(ConfigError);
    });
  }

  it("refuse une adresse qui n'est pas une cle", () => {
    expect(() =>
      chargerConfig({ ...complet, NEXT_PUBLIC_DEPOSIT_MINT: "pas-une-cle" }),
    ).toThrow(/cle publique valide/);
  });

  it("accepte une configuration complete sur devnet", () => {
    const c = chargerConfig(complet);
    expect(c.vaultProgramId.toBase58()).toBe(complet.NEXT_PUBLIC_VAULT_PROGRAM_ID);
    expect(c.porteurAutorise.toBase58()).toBe(complet.NEXT_PUBLIC_PORTEUR_AUTORISE);
  });
});

describe("cette demonstration ne s'execute pas sur le mainnet", () => {
  // Elle fait signer le portefeuille d'un visiteur. Pointee sur un reseau de
  // production, elle refuse de s'afficher plutot que de laisser croire qu'elle
  // y a ete eprouvee.
  it("refuse un point d'acces de production", () => {
    expect(() =>
      chargerConfig({
        ...complet,
        NEXT_PUBLIC_SOLANA_RPC_URL: "https://api.mainnet-beta.solana.com",
      }),
    ).toThrow(/reseau de production/);
  });

  it("reconnait le mainnet a son hote, pas a une promesse", () => {
    expect(viseLeMainnet("https://api.mainnet-beta.solana.com")).toBe(true);
    expect(viseLeMainnet("https://MAINNET.example.com")).toBe(true);
    expect(viseLeMainnet("https://api.devnet.solana.com")).toBe(false);
  });
});
