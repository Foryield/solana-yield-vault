//! Fixtures d'adresses du module de conformite, confrontees au client
//! TypeScript. Meme motif et meme raison que celles du coffre.
//!
//! Regenerer apres un changement de graines : `REGENERER_FIXTURES=1 cargo test`.

use {solana_pubkey::Pubkey, std::path::PathBuf, std::str::FromStr};

const MINT_TEMOIN: &str = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const PORTEUR_TEMOIN: &str = "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr";

fn chemin_fixture() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("client")
        .join("test")
        .join("fixtures")
        .join("hook-addresses.json")
}

#[test]
fn les_adresses_derivees_correspondent_a_la_fixture() {
    let program_id = compliance_hook::id();
    let mint = Pubkey::from_str(MINT_TEMOIN).unwrap();
    let porteur = Pubkey::from_str(PORTEUR_TEMOIN).unwrap();

    let (config, _) = Pubkey::find_program_address(
        &[compliance_hook::state::CONFIG_SEED, mint.as_ref()],
        &program_id,
    );
    let (entree, _) = Pubkey::find_program_address(
        &[
            compliance_hook::state::ALLOW_SEED,
            mint.as_ref(),
            porteur.as_ref(),
        ],
        &program_id,
    );
    // Graine IMPOSEE par l'interface : Token-2022 derive lui-meme cette adresse.
    let (metas, _) =
        Pubkey::find_program_address(&[b"extra-account-metas", mint.as_ref()], &program_id);

    let attendu = format!(
        "{{\n  \"programId\": \"{program_id}\",\n  \"mint\": \"{mint}\",\n  \"holder\": \"{porteur}\",\n  \"config\": \"{config}\",\n  \"allowlistEntry\": \"{entree}\",\n  \"extraAccountMetas\": \"{metas}\"\n}}\n"
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
