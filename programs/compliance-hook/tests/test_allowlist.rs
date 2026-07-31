//! Gestion de la liste d'autorisation, et garde de l'instruction d'execution.

mod common;

use {
    anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas},
    common::*,
    solana_instruction::Instruction,
    solana_keypair::Keypair,
    solana_pubkey::Pubkey,
    solana_signer::Signer,
};

fn coffre_attache() -> Contexte {
    let mut c = preparer();
    attacher(&mut c).expect("attachement refuse");
    c
}

#[test]
fn l_autorite_autorise_un_porteur() {
    let mut c = coffre_attache();
    let porteur = Pubkey::new_unique();

    autoriser(&mut c, &porteur).expect("autorisation refusee");

    let compte = c
        .svm
        .get_account(&entree_de(&c, &porteur))
        .expect("entree absente");
    let mut data: &[u8] = &compte.data;
    let entree = compliance_hook::state::AllowlistEntry::try_deserialize(&mut data).unwrap();
    assert_eq!(entree.holder, porteur);
}

#[test]
fn un_tiers_ne_peut_pas_autoriser() {
    let mut c = coffre_attache();
    let intrus = Keypair::new();
    let porteur = Pubkey::new_unique();

    assert!(
        autoriser_par(&mut c, &porteur, &intrus).is_err(),
        "seule l'autorite de la liste autorise"
    );
    assert!(
        c.svm.get_account(&entree_de(&c, &porteur)).is_none()
            || c.svm
                .get_account(&entree_de(&c, &porteur))
                .unwrap()
                .data
                .is_empty(),
        "une tentative refusee ne cree aucune entree"
    );
}

#[test]
fn la_revocation_ferme_le_compte() {
    let mut c = coffre_attache();
    let porteur = Pubkey::new_unique();
    autoriser(&mut c, &porteur).expect("autorisation refusee");

    let autorite = c.autorite.insecure_clone();
    revoquer_par(&mut c, &porteur, &autorite).expect("revocation refusee");

    let apres = c.svm.get_account(&entree_de(&c, &porteur));
    assert!(
        apres.is_none() || apres.unwrap().data.is_empty(),
        "revoquer ferme le compte : il ne reste aucun etat residuel a interpreter"
    );
}

#[test]
fn un_tiers_ne_peut_pas_revoquer() {
    let mut c = coffre_attache();
    let porteur = Pubkey::new_unique();
    autoriser(&mut c, &porteur).expect("autorisation refusee");

    let intrus = Keypair::new();
    c.svm.airdrop(&intrus.pubkey(), 1_000_000_000).unwrap();
    assert!(
        revoquer_par(&mut c, &porteur, &intrus).is_err(),
        "seule l'autorite de la liste revoque"
    );
    assert!(
        c.svm.get_account(&entree_de(&c, &porteur)).is_some(),
        "l'entree survit a une tentative refusee"
    );
}

#[test]
fn autoriser_deux_fois_refuse() {
    let mut c = coffre_attache();
    let porteur = Pubkey::new_unique();
    autoriser(&mut c, &porteur).expect("autorisation refusee");

    assert!(
        autoriser(&mut c, &porteur).is_err(),
        "une entree deja presente ne se recree pas"
    );
}

#[test]
fn reautoriser_apres_revocation_fonctionne() {
    let mut c = coffre_attache();
    let porteur = Pubkey::new_unique();
    let autorite = c.autorite.insecure_clone();

    autoriser(&mut c, &porteur).expect("autorisation refusee");
    revoquer_par(&mut c, &porteur, &autorite).expect("revocation refusee");
    autoriser(&mut c, &porteur).expect("re-autorisation refusee");

    assert!(c.svm.get_account(&entree_de(&c, &porteur)).is_some());
}

#[test]
fn l_execution_appelee_directement_est_refusee() {
    let mut c = coffre_attache();
    let emetteur = Keypair::new();
    let destinataire = Keypair::new();
    let source = compte_de_parts(&mut c, &emetteur.pubkey(), 1_000);
    let destination = compte_de_parts(&mut c, &destinataire.pubkey(), 0);
    autoriser(&mut c, &destinataire.pubkey()).expect("autorisation refusee");

    // Tous les comptes sont valides et le destinataire est AUTORISE : seule la
    // garde de transfert doit faire echouer l'appel. Sans elle, ce test
    // passerait.
    let ix = Instruction::new_with_bytes(
        compliance_hook::id(),
        &compliance_hook::instruction::TransferHook { amount: 100 }.data(),
        compliance_hook::accounts::Execute {
            source_token: source,
            mint: c.mint,
            destination_token: destination,
            owner: emetteur.pubkey(),
            extra_account_meta_list: c.metas,
            destination_entry: entree_de(&c, &destinataire.pubkey()),
        }
        .to_account_metas(None),
    );

    let payeur = c.payeur.insecure_clone();
    let e = envoyer(&mut c.svm, &[ix], &payeur, &[])
        .expect_err("un appel direct de l'execution doit echouer");
    assert_eq!(
        code_erreur(&e),
        Some(code_de(compliance_hook::error::HookError::NotATransfer)),
        "refus attendu sur la garde de transfert, pas sur autre chose"
    );
}
