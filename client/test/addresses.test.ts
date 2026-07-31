import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import vaultFixture from "./fixtures/vault-addresses.json" with { type: "json" };
import hookFixture from "./fixtures/hook-addresses.json" with { type: "json" };
import {
  allowlistEntryAddress,
  extraAccountMetasAddress,
  hookConfigAddress,
  vaultAddresses,
} from "../src/addresses.js";

/**
 * Ces tests ne verifient pas que la derivation est « correcte » dans l'absolu :
 * ils verifient qu'elle est IDENTIQUE a celle du programme.
 *
 * Les fixtures sont produites par les tests Rust, qui derivent avec les memes
 * graines depuis les constantes des programmes. Une divergence entre les deux
 * implementations fait tomber ce test au lieu de produire, a l'execution, un
 * compte introuvable dont l'erreur ne nomme jamais la cause.
 */

describe("adresses du coffre", () => {
  const programId = new PublicKey(vaultFixture.programId);
  const depositMint = new PublicKey(vaultFixture.depositMint);

  it("derive les memes adresses que le programme", () => {
    const a = vaultAddresses(programId, depositMint);
    expect(a.vault.toBase58()).toBe(vaultFixture.vault);
    expect(a.sharesMint.toBase58()).toBe(vaultFixture.sharesMint);
    expect(a.vaultAssets.toBase58()).toBe(vaultFixture.vaultAssets);
    expect(a.deadShares.toBase58()).toBe(vaultFixture.deadShares);
  });

  it("derive un coffre different par actif depose", () => {
    const autre = new PublicKey(hookFixture.holder);
    expect(vaultAddresses(programId, autre).vault.toBase58()).not.toBe(
      vaultFixture.vault,
    );
  });
});

describe("adresses du module de conformite", () => {
  const programId = new PublicKey(hookFixture.programId);
  const mint = new PublicKey(hookFixture.mint);
  const holder = new PublicKey(hookFixture.holder);

  it("derive la configuration comme le programme", () => {
    expect(hookConfigAddress(programId, mint).toBase58()).toBe(hookFixture.config);
  });

  it("derive l'entree de liste comme le programme", () => {
    expect(allowlistEntryAddress(programId, mint, holder).toBase58()).toBe(
      hookFixture.allowlistEntry,
    );
  });

  it("derive la liste de comptes supplementaires comme le programme", () => {
    // Celle-ci compte double : sa graine est imposee par l'interface de hook,
    // et Token-2022 la derive lui-meme pour la trouver. S'en ecarter rendrait
    // le hook inerte.
    expect(extraAccountMetasAddress(programId, mint).toBase58()).toBe(
      hookFixture.extraAccountMetas,
    );
  });

  it("derive une entree differente par porteur", () => {
    const autre = new PublicKey(vaultFixture.vault);
    expect(allowlistEntryAddress(programId, mint, autre).toBase58()).not.toBe(
      hookFixture.allowlistEntry,
    );
  });
});
