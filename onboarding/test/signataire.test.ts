import { describe, expect, it } from "vitest";
import { generateKeyPairSync, verify } from "node:crypto";
import { SignataireDeCle } from "../src/signataire.js";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

function defi(...ids: string[]) {
  return {
    challenge: "un-defi",
    allowCredentials: { key: ids.map((id) => ({ id })), webauthn: [] },
  } as never;
}

describe("SignataireDeCle", () => {
  /**
   * LE POINT DE TOUT CE MODULE. Le defi porte deja la liste des credentials
   * autorises : reclamer l'identifiant en configuration revenait a le demander
   * a l'operateur pour le comparer a une reponse qui le contient.
   */
  it("lit l'identifiant dans le defi, sans configuration", async () => {
    const s = new SignataireDeCle(pem);
    const a = await s.sign(defi("cr-unique"));
    expect(a.kind).toBe("Key");
    expect(a.credentialAssertion.credId).toBe("cr-unique");
  });

  it("signe des donnees que le fournisseur pourra verifier", async () => {
    const s = new SignataireDeCle(pem);
    const a = await s.sign(defi("cr-unique"));
    const donnees = Buffer.from(a.credentialAssertion.clientData, "base64url");
    expect(JSON.parse(donnees.toString())).toEqual({
      type: "key.get",
      challenge: "un-defi",
    });
    const signature = Buffer.from(a.credentialAssertion.signature, "base64url");
    expect(verify(undefined, donnees, publicKey, signature)).toBe(true);
  });

  it("accepte un identifiant impose quand il est autorise", async () => {
    const s = new SignataireDeCle(pem, "cr-deux");
    const a = await s.sign(defi("cr-un", "cr-deux"));
    expect(a.credentialAssertion.credId).toBe("cr-deux");
  });

  /**
   * Le defi ne dit pas laquelle des cles autorisees correspond a la notre.
   * Essayer au hasard produirait un refus opaque du fournisseur, donc on
   * s'arrete en nommant les candidats.
   */
  it("refuse de choisir entre plusieurs credentials, en les nommant", async () => {
    const s = new SignataireDeCle(pem);
    await expect(s.sign(defi("cr-un", "cr-deux"))).rejects.toThrow(/cr-un, cr-deux/);
  });

  it("dit ce qu'il faut verifier quand aucun credential n'est autorise", async () => {
    const s = new SignataireDeCle(pem);
    await expect(s.sign(defi())).rejects.toThrow(/cle publique/);
  });

  it("refuse un identifiant impose absent de la liste", async () => {
    const s = new SignataireDeCle(pem, "cr-ailleurs");
    await expect(s.sign(defi("cr-un"))).rejects.toThrow(/ne figure pas/);
  });
});
