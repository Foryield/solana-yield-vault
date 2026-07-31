//! Coupe-circuit, eprouve par comportement sous LiteSVM.
//!
//! Ces tests exercent aussi, pour la premiere fois, les gardes posees dans le
//! depot et le retrait : jusqu'ici elles etaient ecrites mais jamais
//! declenchees, donc jamais verifiees.

mod common;

use {
    anchor_lang::{InstructionData, ToAccountMetas},
    common::*,
    solana_instruction::Instruction,
    solana_keypair::Keypair,
    solana_pubkey::Pubkey,
    solana_signer::Signer,
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

fn basculer(
    c: &mut Contexte,
    par: &Keypair,
    suspendu: bool,
) -> Result<(), Box<litesvm::types::FailedTransactionMetadata>> {
    let ix = Instruction::new_with_bytes(
        yield_vault::id(),
        &yield_vault::instruction::SetPaused { paused: suspendu }.data(),
        yield_vault::accounts::SetPaused {
            admin: par.pubkey(),
            vault: c.vault,
        }
        .to_account_metas(None),
    );
    let cle = par.insecure_clone();
    envoyer(&mut c.svm, &[ix], &cle, &[])
}

fn coffre_amorce() -> (Contexte, Porteur) {
    let mut c = preparer();
    initialiser(&mut c);
    let p = porteur(&mut c, 50_000);
    deposer(&mut c, &p, 10_000).expect("depot refuse");
    (c, p)
}

#[test]
fn l_administrateur_suspend_et_reprend() {
    let (mut c, _p) = coffre_amorce();
    let admin = c.admin.insecure_clone();

    basculer(&mut c, &admin, true).expect("suspension refusee");
    assert!(lire_coffre(&c).paused);

    basculer(&mut c, &admin, false).expect("reprise refusee");
    assert!(!lire_coffre(&c).paused);
}

#[test]
fn un_tiers_ne_peut_pas_suspendre() {
    let (mut c, _p) = coffre_amorce();
    let intrus = Keypair::new();
    c.svm.airdrop(&intrus.pubkey(), 1_000_000_000).unwrap();

    assert!(
        basculer(&mut c, &intrus, true).is_err(),
        "seul l'administrateur peut suspendre"
    );
    assert!(
        !lire_coffre(&c).paused,
        "une tentative refusee ne doit rien changer"
    );
}

#[test]
fn un_tiers_ne_peut_pas_lever_la_suspension() {
    let (mut c, _p) = coffre_amorce();
    let admin = c.admin.insecure_clone();
    basculer(&mut c, &admin, true).expect("suspension refusee");

    let intrus = Keypair::new();
    c.svm.airdrop(&intrus.pubkey(), 1_000_000_000).unwrap();
    assert!(
        basculer(&mut c, &intrus, false).is_err(),
        "seul l'administrateur peut lever la suspension"
    );
    assert!(lire_coffre(&c).paused, "le coffre reste suspendu");
}

#[test]
fn la_suspension_bloque_le_depot() {
    let (mut c, p) = coffre_amorce();
    let admin = c.admin.insecure_clone();
    basculer(&mut c, &admin, true).expect("suspension refusee");

    let e = deposer(&mut c, &p, 1_000).expect_err("un depot suspendu doit echouer");
    assert_eq!(
        code_erreur(&e),
        Some(code_de(yield_vault::error::VaultError::Paused)),
        "refus attendu sur la suspension, pas sur autre chose"
    );
}

#[test]
fn la_suspension_bloque_le_retrait() {
    let (mut c, p) = coffre_amorce();
    let admin = c.admin.insecure_clone();
    basculer(&mut c, &admin, true).expect("suspension refusee");

    let e = retirer(&mut c, &p, 1_000).expect_err("un retrait suspendu doit echouer");
    assert_eq!(
        code_erreur(&e),
        Some(code_de(yield_vault::error::VaultError::Paused)),
        "refus attendu sur la suspension, pas sur autre chose"
    );
}

#[test]
fn la_reprise_rouvre_les_deux_flux() {
    let (mut c, p) = coffre_amorce();
    let admin = c.admin.insecure_clone();
    basculer(&mut c, &admin, true).expect("suspension refusee");
    basculer(&mut c, &admin, false).expect("reprise refusee");

    deposer(&mut c, &p, 1_000).expect("depot refuse apres reprise");
    retirer(&mut c, &p, 500).expect("retrait refuse apres reprise");
}

#[test]
fn la_suspension_ne_deplace_aucun_fonds() {
    let (mut c, p) = coffre_amorce();
    let avant_coffre = solde(&c, &c.vault_assets);
    let avant_porteur = solde(&c, &p.parts);
    let admin = c.admin.insecure_clone();

    basculer(&mut c, &admin, true).expect("suspension refusee");

    assert_eq!(solde(&c, &c.vault_assets), avant_coffre);
    assert_eq!(solde(&c, &p.parts), avant_porteur);
}
