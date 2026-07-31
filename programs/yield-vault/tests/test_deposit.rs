//! Depot, eprouve par comportement sous LiteSVM.

mod common;

use {
    anchor_lang::{InstructionData, ToAccountMetas},
    common::*,
    solana_instruction::Instruction,
    solana_keypair::Keypair,
    solana_pubkey::Pubkey,
    solana_signer::Signer,
    yield_vault::math::MINIMUM_LIQUIDITY,
};

struct Deposant {
    cle: Keypair,
    actifs: Pubkey,
    parts: Pubkey,
}

fn deposant(c: &mut Contexte, dotation: u64) -> Deposant {
    let cle = Keypair::new();
    c.svm.airdrop(&cle.pubkey(), 1_000_000_000).unwrap();
    let actifs = compte_actif_approvisionne(c, &cle.pubkey(), dotation);
    let parts = compte_de_parts(c, &cle.pubkey());
    Deposant { cle, actifs, parts }
}

fn instruction_depot(c: &Contexte, d: &Deposant, montant: u64) -> Instruction {
    Instruction::new_with_bytes(
        yield_vault::id(),
        &yield_vault::instruction::Deposit { amount: montant }.data(),
        yield_vault::accounts::Deposit {
            depositor: d.cle.pubkey(),
            vault: c.vault,
            deposit_mint: c.deposit_mint,
            shares_mint: c.shares_mint,
            vault_assets: c.vault_assets,
            dead_shares: c.dead_shares,
            depositor_assets: d.actifs,
            depositor_shares: d.parts,
            shares_token_program: spl_token_2022::id(),
            deposit_token_program: spl_token::id(),
        }
        .to_account_metas(None),
    )
}

fn deposer(
    c: &mut Contexte,
    d: &Deposant,
    montant: u64,
) -> Result<(), Box<litesvm::types::FailedTransactionMetadata>> {
    let ix = instruction_depot(c, d, montant);
    let cle = d.cle.insecure_clone();
    envoyer(&mut c.svm, &[ix], &cle, &[])
}

#[test]
fn premier_depot_verrouille_les_parts_mortes() {
    let mut c = preparer();
    initialiser(&mut c);
    let d = deposant(&mut c, 50_000);

    deposer(&mut c, &d, 10_000).expect("depot refuse");

    assert_eq!(
        solde(&c, &d.parts),
        10_000 - MINIMUM_LIQUIDITY,
        "le deposant recoit le depot moins les parts mortes"
    );
    assert_eq!(
        solde(&c, &c.dead_shares),
        MINIMUM_LIQUIDITY,
        "les parts mortes sont verrouillees au premier depot"
    );
    assert_eq!(
        offre_des_parts(&c),
        10_000,
        "l'offre du mint reste la verite : elle inclut les parts mortes"
    );
    assert_eq!(solde(&c, &c.vault_assets), 10_000, "l'actif est entre");
    assert_eq!(solde(&c, &d.actifs), 40_000, "l'actif a quitte le deposant");
}

#[test]
fn second_depot_au_pro_rata() {
    let mut c = preparer();
    initialiser(&mut c);
    let premier = deposant(&mut c, 50_000);
    let second = deposant(&mut c, 50_000);

    deposer(&mut c, &premier, 10_000).expect("premier depot refuse");
    deposer(&mut c, &second, 5_000).expect("second depot refuse");

    // Ratio 1:1 (aucune strategie branchee) : 5 000 x 10 000 / 10 000 = 5 000.
    assert_eq!(solde(&c, &second.parts), 5_000);
    assert_eq!(
        solde(&c, &c.dead_shares),
        MINIMUM_LIQUIDITY,
        "les parts mortes ne sont verrouillees qu'une fois"
    );
    assert_eq!(offre_des_parts(&c), 15_000);
    assert_eq!(solde(&c, &c.vault_assets), 15_000);
}

#[test]
fn le_second_deposant_ne_capte_pas_les_parts_mortes() {
    let mut c = preparer();
    initialiser(&mut c);
    let premier = deposant(&mut c, 50_000);
    let second = deposant(&mut c, 50_000);

    deposer(&mut c, &premier, 10_000).expect("premier depot refuse");
    deposer(&mut c, &second, 10_000).expect("second depot refuse");

    assert_eq!(
        solde(&c, &second.parts),
        10_000,
        "un montant identique donne des parts identiques, la genese mise a part"
    );
    assert!(
        solde(&c, &premier.parts) < solde(&c, &second.parts),
        "le premier deposant paie les parts mortes, pas le second"
    );
}

#[test]
fn depot_nul_refuse() {
    let mut c = preparer();
    initialiser(&mut c);
    let d = deposant(&mut c, 50_000);

    let e = deposer(&mut c, &d, 0).expect_err("un depot nul doit echouer");
    assert_eq!(
        code_erreur(&e),
        Some(code_de(
            yield_vault::error::VaultError::AmountMustBePositive
        )),
        "refus attendu sur le montant, pas sur autre chose"
    );
}

#[test]
fn depot_de_genese_egal_aux_parts_mortes_refuse() {
    let mut c = preparer();
    initialiser(&mut c);
    let d = deposant(&mut c, 50_000);

    let e = deposer(&mut c, &d, MINIMUM_LIQUIDITY)
        .expect_err("une genese qui n'excede pas les parts mortes doit echouer");
    assert_eq!(
        code_erreur(&e),
        Some(code_de(yield_vault::error::VaultError::DepositTooSmall)),
        "refus attendu sur la taille du depot, pas sur autre chose"
    );
    assert_eq!(
        solde(&c, &c.vault_assets),
        0,
        "un depot refuse ne laisse aucun actif derriere lui"
    );
}

#[test]
fn depot_de_genese_d_une_unite_au_dessus_accepte() {
    let mut c = preparer();
    initialiser(&mut c);
    let d = deposant(&mut c, 50_000);

    deposer(&mut c, &d, MINIMUM_LIQUIDITY + 1).expect("depot refuse");
    assert_eq!(solde(&c, &d.parts), 1);
    assert_eq!(solde(&c, &c.dead_shares), MINIMUM_LIQUIDITY);
}
