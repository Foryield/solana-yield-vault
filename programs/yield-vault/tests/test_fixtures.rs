//! Fixtures d'adresses, confrontees au client TypeScript.
//!
//! Le programme derive ses adresses en Rust, le client les redérive en
//! TypeScript : ce sont deux implementations, et une divergence ne se voit pas
//! a la compilation. Elle se manifeste a l'execution par un compte introuvable,
//! l'un des symptomes les plus opaques de Solana.
//!
//! Ce test fige les adresses attendues pour un mint FIXE. Le test TypeScript
//! relit le meme fichier et compare a sa propre derivation. Les deux cotes sont
//! ainsi confrontes a chaque execution, plutot que supposes d'accord.
//!
//! Regenerer apres un changement de graines : `REGENERER_FIXTURES=1 cargo test`.

use {solana_pubkey::Pubkey, std::path::PathBuf, std::str::FromStr};

/// Mint arbitraire mais FIXE. Sa valeur n'a aucune importance ; sa stabilite
/// en a toute : c'est elle qui rend la comparaison possible.
const MINT_TEMOIN: &str = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

fn chemin_fixture() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("client")
        .join("test")
        .join("fixtures")
        .join("vault-addresses.json")
}

#[test]
fn les_adresses_derivees_correspondent_a_la_fixture() {
    let program_id = yield_vault::id();
    let mint = Pubkey::from_str(MINT_TEMOIN).unwrap();

    let (vault, _) = Pubkey::find_program_address(
        &[yield_vault::state::VAULT_SEED, mint.as_ref()],
        &program_id,
    );
    let (shares_mint, _) = Pubkey::find_program_address(
        &[yield_vault::state::SHARES_SEED, vault.as_ref()],
        &program_id,
    );
    let (vault_assets, _) = Pubkey::find_program_address(
        &[yield_vault::state::ASSETS_SEED, vault.as_ref()],
        &program_id,
    );
    let (dead_shares, _) = Pubkey::find_program_address(
        &[yield_vault::state::DEAD_SEED, vault.as_ref()],
        &program_id,
    );

    let attendu = format!(
        "{{\n  \"programId\": \"{program_id}\",\n  \"depositMint\": \"{mint}\",\n  \"vault\": \"{vault}\",\n  \"sharesMint\": \"{shares_mint}\",\n  \"vaultAssets\": \"{vault_assets}\",\n  \"deadShares\": \"{dead_shares}\"\n}}\n"
    );

    let chemin = chemin_fixture();
    if std::env::var("REGENERER_FIXTURES").is_ok() {
        std::fs::create_dir_all(chemin.parent().unwrap()).unwrap();
        std::fs::write(&chemin, &attendu).unwrap();
        return;
    }

    let present = std::fs::read_to_string(&chemin).unwrap_or_else(|_| {
        panic!(
            "fixture absente : {}. Lancer `REGENERER_FIXTURES=1 cargo test`.",
            chemin.display()
        )
    });
    assert_eq!(
        present, attendu,
        "les adresses derivees ne correspondent plus a la fixture. Si le \
         changement est voulu, regenerer ET verifier que le client TypeScript \
         suit."
    );
}
