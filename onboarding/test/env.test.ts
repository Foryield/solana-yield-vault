import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chargerFichier, fichierParDefaut } from "../src/env.js";

/**
 * Chaque test passe un chemin temporaire explicite : le fichier
 * d'identifiants reel n'est jamais lu par cette suite.
 */

const repertoires: string[] = [];
const poses: string[] = [];

function fichierTemporaire(contenu: string): string {
  const dossier = mkdtempSync(path.join(tmpdir(), "onboarding-env-"));
  repertoires.push(dossier);
  const chemin = path.join(dossier, "identifiants.env");
  writeFileSync(chemin, contenu);
  return chemin;
}

function suivre(...cles: string[]): void {
  poses.push(...cles);
}

afterEach(() => {
  for (const cle of poses) delete process.env[cle];
  poses.length = 0;
  for (const d of repertoires) rmSync(d, { recursive: true, force: true });
  repertoires.length = 0;
  delete process.env["ONBOARDING_ENV_FILE"];
});

describe("fichierParDefaut", () => {
  /**
   * LE TEST QUI JUSTIFIE LE MODULE ENTIER. Ce depot est public : le fichier
   * d'identifiants ne doit jamais resoudre a l'interieur. Un depot voisin a du
   * poser ce garde-fou apres avoir heberge une cle ; ici il est pose avant.
   */
  it("ne resout jamais dans le depot", () => {
    const racine = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
    expect(path.resolve(fichierParDefaut()).startsWith(racine + path.sep)).toBe(false);
  });

  it("pointe le repertoire de configuration de l'utilisateur", () => {
    expect(fichierParDefaut()).toBe(
      path.join(homedir(), ".config", "foryield", "solana-onboarding.env"),
    );
  });

  it("se deplace par ONBOARDING_ENV_FILE", () => {
    process.env["ONBOARDING_ENV_FILE"] = "/ailleurs/identifiants.env";
    expect(fichierParDefaut()).toBe("/ailleurs/identifiants.env");
  });
});

describe("chargerFichier", () => {
  it("accepte l'absence de fichier : tout peut venir de variables exportees", () => {
    expect(() => chargerFichier("/ce/chemin/n/existe/pas.env")).not.toThrow();
  });

  it("lit les paires et ignore commentaires et lignes vides", () => {
    suivre("EXEMPLE_A", "EXEMPLE_B");
    chargerFichier(
      fichierTemporaire("# un commentaire\n\nEXEMPLE_A=un\nEXEMPLE_B=deux\n"),
    );
    expect(process.env["EXEMPLE_A"]).toBe("un");
    expect(process.env["EXEMPLE_B"]).toBe("deux");
  });

  it("restitue une cle PEM tenant sur une ligne", () => {
    suivre("EXEMPLE_PEM");
    chargerFichier(
      fichierTemporaire('EXEMPLE_PEM="-----BEGIN-----\\nligne\\n-----END-----"\n'),
    );
    expect(process.env["EXEMPLE_PEM"]).toBe("-----BEGIN-----\nligne\n-----END-----");
  });

  it("laisse gagner une variable deja exportee", () => {
    suivre("EXEMPLE_C");
    process.env["EXEMPLE_C"] = "de-l-environnement";
    chargerFichier(fichierTemporaire("EXEMPLE_C=du-fichier\n"));
    expect(process.env["EXEMPLE_C"]).toBe("de-l-environnement");
  });
});
