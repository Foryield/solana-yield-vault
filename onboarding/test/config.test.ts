import { describe, expect, it } from "vitest";
import {
  ConfigError,
  GENESE_DEVNET,
  GENESE_MAINNET,
  RESEAU,
  chargerConfig,
  chargerGarde,
  chargerTresorerie,
  exigeDevnet,
  lienTransaction,
} from "../src/config.js";

const COMPLET = {
  SOLANA_RPC_URL: "https://api.devnet.solana.com",
  VAULT_PROGRAM_ID: "2bkjZG8njXHQ1tdj5aRSiwjjndX1qEvjFYzBYJQjNysw",
  HOOK_PROGRAM_ID: "EGbJBdCUK5ecUiVJ9FFiGdVEZQ15cE31zNm97RUpFK63",
  DEPOSIT_MINT: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
};

describe("le reseau est un verrou, pas un reglage", () => {
  // Le garde-fou du spike S5 tient a cette constante. Le fournisseur de garde
  // n'ayant pas d'API de bac a sable, aucun controle d'URL ne peut separer la
  // production du reste : le reseau demande est le seul verrou verifiable, et
  // il n'existe aucune variable d'environnement pour s'en ecarter.
  it("ne peut valoir que le reseau de test", () => {
    expect(RESEAU).toBe("SolanaDevnet");
    expect(RESEAU).not.toBe("Solana");
  });

  it("ne se lit dans aucune variable d'environnement", () => {
    const config = chargerConfig({
      ...COMPLET,
      DFNS_NETWORK: "Solana",
      SOLANA_NETWORK: "Solana",
    });
    expect(config.reseau).toBe("SolanaDevnet");
  });
});

describe("chargerConfig", () => {
  for (const nom of Object.keys(COMPLET)) {
    it(`refuse de deviner ${nom}`, () => {
      const env = { ...COMPLET, [nom]: undefined };
      expect(() => chargerConfig(env)).toThrow(ConfigError);
      expect(() => chargerConfig(env)).toThrow(nom);
    });
  }

  it("refuse une cle publique invalide plutot que de la porter plus loin", () => {
    expect(() => chargerConfig({ ...COMPLET, DEPOSIT_MINT: "pas-une-cle" })).toThrow(
      /pas une cle publique valide/,
    );
  });

  it("rend les identifiants sous forme de cles publiques", () => {
    const config = chargerConfig(COMPLET);
    expect(config.vaultProgramId.toBase58()).toBe(COMPLET.VAULT_PROGRAM_ID);
    expect(config.depositMint.toBase58()).toBe(COMPLET.DEPOSIT_MINT);
  });
});

describe("les identifiants de garde", () => {
  const GARDE = {
    DFNS_API_URL: "https://api.exemple.test",
    DFNS_AUTH_TOKEN: "jeton",
    DFNS_CRED_ID: "cred",
    DFNS_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----",
  };

  // L'hote n'a PAS de defaut, alors que le depot voisin en pose un. Un defaut
  // d'hote donne l'illusion d'un choix d'environnement la ou il n'y en a pas.
  it("exigent leur hote, sans defaut", () => {
    expect(() => chargerGarde({ ...GARDE, DFNS_API_URL: undefined })).toThrow(
      /DFNS_API_URL/,
    );
  });

  for (const nom of Object.keys(GARDE)) {
    it(`refusent de deviner ${nom}`, () => {
      expect(() => chargerGarde({ ...GARDE, [nom]: undefined })).toThrow(ConfigError);
    });
  }

  it("ne sont pas exiges par la configuration de chaine", () => {
    // C'est ce qui permet de composer une enveloppe sans tenir le moindre
    // pouvoir de signature.
    expect(() => chargerConfig(COMPLET)).not.toThrow();
  });
});

describe("la tresorerie", () => {
  it("exige sa cle", () => {
    expect(() => chargerTresorerie({})).toThrow(/SOLANA_KEYPAIR/);
  });

  it("n'est pas exigee par la configuration de chaine", () => {
    expect(() => chargerConfig(COMPLET)).not.toThrow();
  });
});

describe("exigeDevnet", () => {
  const lecteur = (genese: string) => ({
    getGenesisHash: async () => genese,
  });

  it("laisse passer devnet", async () => {
    await expect(exigeDevnet(lecteur(GENESE_DEVNET) as never)).resolves.toBeUndefined();
  });

  // Un point d'acces peut s'appeler comme il veut : sa chaine de genese, non.
  it("refuse le mainnet et le nomme", async () => {
    await expect(exigeDevnet(lecteur(GENESE_MAINNET) as never)).rejects.toThrow(
      /mainnet/,
    );
  });

  it("refuse une chaine inconnue au meme titre", async () => {
    await expect(exigeDevnet(lecteur("Chaine1nconnue") as never)).rejects.toThrow(
      ConfigError,
    );
  });
});

describe("lienTransaction", () => {
  it("nomme le cluster, sans quoi une preuve ne prouve rien", () => {
    expect(lienTransaction("sig")).toContain("cluster=devnet");
  });
});
