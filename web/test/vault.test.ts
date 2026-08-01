import { describe, expect, it } from "vitest";
import { chargerConfig } from "../lib/config";
import { enUnites, formater, motifDuRefus, panneLisible } from "../lib/vault";

/**
 * Ces tests ne touchent pas le reseau. Ils portent sur les trois endroits ou
 * la page peut mentir sans qu'aucun type ne s'en apercoive : la traduction
 * d'un refus, l'affichage d'un montant, et la lecture d'une saisie.
 */

const config = chargerConfig({
  NEXT_PUBLIC_SOLANA_RPC_URL: "https://api.devnet.solana.com",
  NEXT_PUBLIC_VAULT_PROGRAM_ID: "2bkjZG8njXHQ1tdj5aRSiwjjndX1qEvjFYzBYJQjNysw",
  NEXT_PUBLIC_HOOK_PROGRAM_ID: "EGbJBdCUK5ecUiVJ9FFiGdVEZQ15cE31zNm97RUpFK63",
  NEXT_PUBLIC_DEPOSIT_MINT: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  NEXT_PUBLIC_PORTEUR_AUTORISE: "Dz7mzmQS9YDvDMu9faWms41rfcyUM3vZDRXu9ZNhLgKr",
  NEXT_PUBLIC_PORTEUR_NON_AUTORISE: "BeBQQqjuUFU1qjJayMg46CWuaKw7oTJ5R4UfoVLVKohL",
});

/** Journaux du refus reellement mesure sur devnet le 2026-08-01. */
const REFUS = [
  "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb invoke [1]",
  "Program log: Instruction: TransferChecked",
  "Program EGbJBdCUK5ecUiVJ9FFiGdVEZQ15cE31zNm97RUpFK63 invoke [2]",
  "Program log: Instruction: TransferHook",
  "Program log: AnchorError thrown in programs/compliance-hook/src/instructions/execute.rs:73. Error Code: NotAllowed. Error Number: 6001. Error Message: Le destinataire n'est pas sur la liste d'autorisation.",
  "Program EGbJBdCUK5ecUiVJ9FFiGdVEZQ15cE31zNm97RUpFK63 failed: custom program error: 0x1771",
  "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb failed: custom program error: 0x1771",
];

describe("un refus s'affiche dans les mots du programme", () => {
  it("prend le message du journal quand il y est", () => {
    expect(motifDuRefus(config, { logs: REFUS })).toBe(
      "Le destinataire n'est pas sur la liste d'autorisation",
    );
  });

  it("retrouve le libelle dans l'IDL quand le message manque", () => {
    // Un echec constate apres envoi ne porte pas toujours la ligne de message.
    const sansMessage = REFUS.filter((l) => !l.includes("Error Message"));
    expect(motifDuRefus(config, { logs: sansMessage })).toBe(
      "Le destinataire n'est pas sur la liste d'autorisation",
    );
  });

  it("choisit le bon IDL : les deux programmes numerotent a partir de 6000", () => {
    // 0x1770 vaut 6000 : "liste de comptes invalide" cote hook, "coffre
    // suspendu" cote coffre. Le code seul est ambigu, l'identifiant du
    // programme fautif tranche.
    const duCoffre =
      "Program 2bkjZG8njXHQ1tdj5aRSiwjjndX1qEvjFYzBYJQjNysw failed: custom program error: 0x1770";
    const duHook =
      "Program EGbJBdCUK5ecUiVJ9FFiGdVEZQ15cE31zNm97RUpFK63 failed: custom program error: 0x1770";
    expect(motifDuRefus(config, { logs: [duCoffre] })).toBe("Le coffre est suspendu");
    expect(motifDuRefus(config, { logs: [duHook] })).toBe(
      "Liste de comptes supplementaires invalide",
    );
  });

  it("va chercher les journaux la ou le portefeuille les enfouit", () => {
    expect(motifDuRefus(config, { error: { logs: REFUS } })).toBe(
      "Le destinataire n'est pas sur la liste d'autorisation",
    );
    expect(motifDuRefus(config, { cause: { logs: REFUS } })).toBe(
      "Le destinataire n'est pas sur la liste d'autorisation",
    );
  });

  it("rend le message brut plutot que rien quand il n'y a aucun journal", () => {
    expect(motifDuRefus(config, new Error("signature refusee"))).toBe(
      "signature refusee",
    );
  });
});

describe("une panne de lecture se dit a un visiteur", () => {
  // Reponse reelle du point d'acces public, rencontree en repetant les
  // lectures : recopiee telle quelle, elle laisse croire a une panne du coffre.
  const debit =
    '429 : {"jsonrpc":"2.0","error":{"code": 429, "message":"Too many requests for a specific RPC call"}}';

  it("traduit une limite de debit et dit que ce n'est pas le coffre", () => {
    const m = panneLisible(new Error(debit));
    expect(m).toMatch(/limite le debit/);
    expect(m).toMatch(/pas le coffre/);
    expect(m).not.toMatch(/jsonrpc/);
  });

  it("traduit une panne de transport", () => {
    expect(panneLisible(new Error("Failed to fetch"))).toMatch(/ne repond pas/);
  });

  it("laisse passer ce qu'elle ne sait pas traduire", () => {
    // Une erreur metier doit arriver intacte plutot que d'etre habillee en
    // incident reseau.
    expect(panneLisible(new Error("Aucun coffre n'est initialise"))).toBe(
      "Aucun coffre n'est initialise",
    );
  });
});

describe("les montants ne passent jamais par un nombre flottant", () => {
  it("affiche sans perdre de precision", () => {
    // 9 007 199 254 740 993 depasse l'entier sur du flottant : un affichage
    // qui passerait par Number le rendrait pair.
    expect(formater(9_007_199_254_740_993n, 6)).toBe("9007199254.740993");
    expect(formater(1_000_000n, 6)).toBe("1.0");
    expect(formater(1_500_000n, 6)).toBe("1.5");
    expect(formater(0n, 6)).toBe("0.0");
    expect(formater(1n, 6)).toBe("0.000001");
  });

  it("lit une saisie, virgule comprise", () => {
    expect(enUnites("1.5", 6)).toBe(1_500_000n);
    expect(enUnites("1,5", 6)).toBe(1_500_000n);
    expect(enUnites("0.000001", 6)).toBe(1n);
    expect(enUnites(" 2 ", 6)).toBe(2_000_000n);
    expect(enUnites(".5", 6)).toBe(500_000n);
  });

  it("refuse plutot que d'arrondir en silence", () => {
    expect(() => enUnites("1.5000001", 6)).toThrow(/6 decimales/);
    expect(() => enUnites("", 6)).toThrow(/illisible/);
    expect(() => enUnites("abc", 6)).toThrow(/illisible/);
    expect(() => enUnites("-1", 6)).toThrow(/illisible/);
  });
});
