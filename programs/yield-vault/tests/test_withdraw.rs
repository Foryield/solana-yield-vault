//! Retrait, eprouve par comportement sous LiteSVM.

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

struct Porteur {
    cle: Keypair,
    actifs: Pubkey,
    parts: Pubkey,
}

fn porteur(c: &mut Contexte, dotation: u64) -> Porteur {
    let cle = Keypair::new();
    c.svm.airdrop(&cle.pubkey(), 1_000_000_000).unwrap();
    let actifs = compte_actif_approvisionne(c, &cle.pubkey(), dotation);
    let parts = compte_de_parts(c, &cle.pubkey());
    Porteur { cle, actifs, parts }
}

fn deposer(
    c: &mut Contexte,
    p: &Porteur,
    montant: u64,
) -> Result<(), Box<litesvm::types::FailedTransactionMetadata>> {
    let ix = Instruction::new_with_bytes(
        yield_vault::id(),
        &yield_vault::instruction::Deposit { amount: montant }.data(),
        yield_vault::accounts::Deposit {
            depositor: p.cle.pubkey(),
            vault: c.vault,
            deposit_mint: c.deposit_mint,
            shares_mint: c.shares_mint,
            vault_assets: c.vault_assets,
            dead_shares: c.dead_shares,
            depositor_assets: p.actifs,
            depositor_shares: p.parts,
            shares_token_program: spl_token_2022::id(),
            deposit_token_program: spl_token::id(),
        }
        .to_account_metas(None),
    );
    let cle = p.cle.insecure_clone();
    envoyer(&mut c.svm, &[ix], &cle, &[])
}

fn retirer(
    c: &mut Contexte,
    p: &Porteur,
    parts: u64,
) -> Result<(), Box<litesvm::types::FailedTransactionMetadata>> {
    let ix = Instruction::new_with_bytes(
        yield_vault::id(),
        &yield_vault::instruction::Withdraw { shares: parts }.data(),
        yield_vault::accounts::Withdraw {
            holder: p.cle.pubkey(),
            vault: c.vault,
            deposit_mint: c.deposit_mint,
            shares_mint: c.shares_mint,
            vault_assets: c.vault_assets,
            holder_assets: p.actifs,
            holder_shares: p.parts,
            shares_token_program: spl_token_2022::id(),
            deposit_token_program: spl_token::id(),
        }
        .to_account_metas(None),
    );
    let cle = p.cle.insecure_clone();
    envoyer(&mut c.svm, &[ix], &cle, &[])
}

/// Coffre initialise, un porteur ayant depose 10 000.
fn coffre_amorce() -> (Contexte, Porteur) {
    let mut c = preparer();
    initialiser(&mut c);
    let p = porteur(&mut c, 50_000);
    deposer(&mut c, &p, 10_000).expect("depot refuse");
    (c, p)
}

#[test]
fn retrait_integral_laisse_la_contrepartie_des_parts_mortes() {
    let (mut c, p) = coffre_amorce();
    let parts = solde(&c, &p.parts);
    assert_eq!(parts, 10_000 - MINIMUM_LIQUIDITY);

    retirer(&mut c, &p, parts).expect("retrait refuse");

    assert_eq!(solde(&c, &p.parts), 0, "toutes les parts sont detruites");
    assert_eq!(
        solde(&c, &p.actifs),
        50_000 - MINIMUM_LIQUIDITY,
        "le porteur recupere son depot moins les parts mortes"
    );
    assert_eq!(
        solde(&c, &c.vault_assets),
        MINIMUM_LIQUIDITY,
        "l'actif adosse aux parts mortes reste au coffre, a jamais"
    );
    assert_eq!(
        offre_des_parts(&c),
        MINIMUM_LIQUIDITY,
        "seules les parts mortes subsistent"
    );
    assert_eq!(solde(&c, &c.dead_shares), MINIMUM_LIQUIDITY);
}

#[test]
fn retrait_partiel_au_pro_rata() {
    let (mut c, p) = coffre_amorce();

    retirer(&mut c, &p, 3_000).expect("retrait refuse");

    // 3 000 x 10 000 / 10 000 = 3 000, ratio 1:1 sans strategie branchee.
    assert_eq!(solde(&c, &p.parts), 10_000 - MINIMUM_LIQUIDITY - 3_000);
    assert_eq!(solde(&c, &p.actifs), 40_000 + 3_000);
    assert_eq!(solde(&c, &c.vault_assets), 7_000);
    assert_eq!(offre_des_parts(&c), 7_000);
}

#[test]
fn aller_retour_ne_rend_pas_plus_que_depose() {
    let (mut c, _premier) = coffre_amorce();
    let second = porteur(&mut c, 50_000);

    deposer(&mut c, &second, 20_000).expect("depot refuse");
    let parts = solde(&c, &second.parts);
    retirer(&mut c, &second, parts).expect("retrait refuse");

    assert!(
        solde(&c, &second.actifs) <= 50_000,
        "un entrant ne doit jamais ressortir avec plus qu'il n'avait"
    );
}

#[test]
fn retrait_nul_refuse() {
    let (mut c, p) = coffre_amorce();

    let e = retirer(&mut c, &p, 0).expect_err("un retrait nul doit echouer");
    assert_eq!(
        code_erreur(&e),
        Some(code_de(
            yield_vault::error::VaultError::SharesMustBePositive
        )),
        "refus attendu sur le nombre de parts, pas sur autre chose"
    );
}

#[test]
fn retrait_au_dela_de_l_offre_refuse() {
    let (mut c, p) = coffre_amorce();

    let trop = offre_des_parts(&c) + 1;
    let e = retirer(&mut c, &p, trop).expect_err("retirer plus que l'offre doit echouer");
    assert_eq!(
        code_erreur(&e),
        Some(code_de(yield_vault::error::VaultError::SharesExceedSupply)),
        "refus attendu sur l'offre, pas sur autre chose"
    );
}

#[test]
fn retrait_des_parts_d_autrui_refuse() {
    let (mut c, p) = coffre_amorce();
    let intrus = porteur(&mut c, 0);

    // L'intrus ne detient aucune part : la destruction doit echouer, et rien
    // ne doit sortir du coffre.
    assert!(
        retirer(&mut c, &intrus, 1_000).is_err(),
        "un porteur sans parts ne doit rien pouvoir retirer"
    );
    assert_eq!(
        solde(&c, &c.vault_assets),
        10_000,
        "un retrait refuse ne fait sortir aucun actif"
    );
    assert_eq!(solde(&c, &p.parts), 10_000 - MINIMUM_LIQUIDITY);
}

#[test]
fn les_parts_mortes_restent_intouchees() {
    let (mut c, p) = coffre_amorce();
    let parts = solde(&c, &p.parts);

    retirer(&mut c, &p, parts).expect("retrait refuse");

    assert_eq!(
        solde(&c, &c.dead_shares),
        MINIMUM_LIQUIDITY,
        "aucune instruction ne sort les parts mortes de leur compte"
    );
}
