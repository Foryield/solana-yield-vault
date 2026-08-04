//! Fixture d'adresse de position, confrontee au client TypeScript.
//!
//! Meme motif que `programs/yield-vault/tests/test_fixtures.rs`, et meme
//! raison : le programme derive l'autorite de position en Rust, le client la
//! redérive en TypeScript. Une divergence ne se voit pas a la compilation et se
//! manifeste par une signature refusee, la venue ne reconnaissant pas le
//! signataire annonce.
//!
//! La position depend de DEUX cles, le coffre et le marche, la ou toutes les
//! autres adresses de ce depot n'en prennent qu'une. C'est precisement ce qui
//! rend la confrontation utile : l'ordre des deux graines est invisible a la
//! lecture et fatal a l'execution.
//!
//! Regenerer apres un changement de graines : `REGENERER_FIXTURES=1 cargo test`.

use {solana_pubkey::Pubkey, std::path::PathBuf, std::str::FromStr};

/// Coffre temoin. Valeur arbitraire mais FIXE : c'est sa stabilite qui rend la
/// comparaison possible, pas sa signification.
const COFFRE_TEMOIN: &str = "SWmEZGD1QjPZZqPXBkRfVsmbZpTEd18uJ3RgMEJCwVW";

/// Marche temoin : le marche USDC de la venue sur devnet, lu le 02/08. Un
/// temoin reel plutot qu'inventé, pour que la fixture parle du cas vise.
const MARCHE_TEMOIN: &str = "98Uy7eonumvRbhQvP5Jt7B3WjNqpndioMF99xvR7sDVa";

fn chemin_fixture() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("client")
        .join("test")
        .join("fixtures")
        .join("allocator-addresses.json")
}

#[test]
fn l_adresse_de_position_correspond_a_la_fixture() {
    let program_id = allocator::id();
    let coffre = Pubkey::from_str(COFFRE_TEMOIN).unwrap();
    let marche = Pubkey::from_str(MARCHE_TEMOIN).unwrap();

    let (position, bump) = Pubkey::find_program_address(
        &[
            allocator::state::POSITION_SEED,
            coffre.as_ref(),
            marche.as_ref(),
        ],
        &program_id,
    );

    let attendu = format!(
        "{{\n  \"programId\": \"{program_id}\",\n  \"coffre\": \"{coffre}\",\n  \"marche\": \"{marche}\",\n  \"position\": \"{position}\",\n  \"bump\": {bump}\n}}\n"
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
        "l'adresse de position derivee ne correspond plus a la fixture. Si le \
         changement est voulu, regenerer ET verifier que le client TypeScript \
         suit."
    );
}

/// L'ORDRE DES DEUX GRAINES PORTE UN SENS. Interverti, il compile, il derive
/// une adresse valide, et il produit un signataire que la venue refusera sans
/// rien nommer. Ce test fige le fait que les deux ordres different.
#[test]
fn intervertir_le_coffre_et_le_marche_ne_donne_pas_la_meme_position() {
    let program_id = allocator::id();
    let coffre = Pubkey::from_str(COFFRE_TEMOIN).unwrap();
    let marche = Pubkey::from_str(MARCHE_TEMOIN).unwrap();

    let (droit, _) = Pubkey::find_program_address(
        &[
            allocator::state::POSITION_SEED,
            coffre.as_ref(),
            marche.as_ref(),
        ],
        &program_id,
    );
    let (inverse, _) = Pubkey::find_program_address(
        &[
            allocator::state::POSITION_SEED,
            marche.as_ref(),
            coffre.as_ref(),
        ],
        &program_id,
    );
    assert_ne!(droit, inverse);
}
