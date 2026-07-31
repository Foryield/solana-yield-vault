//! Initialisation du coffre, eprouvee par comportement sous LiteSVM.

mod common;

use {common::*, solana_pubkey::Pubkey, solana_signer::Signer};

#[test]
fn initialisation_pose_l_etat_du_coffre() {
    let mut c = preparer();
    initialiser(&mut c);

    let vault = lire_coffre(&c);
    assert_eq!(vault.admin, c.admin.pubkey());
    assert_eq!(vault.deposit_mint, c.deposit_mint);
    assert_eq!(vault.shares_mint, c.shares_mint);
    assert_eq!(vault.hook_program, c.hook_program);
    assert!(!vault.paused, "un coffre neuf ne doit pas naitre suspendu");
}

#[test]
fn le_mint_des_parts_porte_le_hook_et_l_autorite_du_coffre() {
    let mut c = preparer();
    initialiser(&mut c);

    assert_eq!(
        proprietaire_de_compte(&c, &c.shares_mint),
        spl_token_2022::id(),
        "les parts doivent etre un mint Token-2022"
    );

    let mint = mint_de_parts(&c);
    assert_eq!(mint.decimals, DECIMALES, "decimales alignees sur l'actif");
    assert_eq!(
        Option::<Pubkey>::from(mint.mint_authority),
        Some(c.vault),
        "seul le coffre doit pouvoir emettre des parts"
    );
    assert_eq!(mint.supply, 0, "aucune part avant le premier depot");

    let hook = hook_du_mint(&c);
    assert_eq!(
        Option::<Pubkey>::from(hook.program_id),
        Some(c.hook_program),
        "le hook declare doit etre celui enregistre"
    );
    assert_eq!(
        Option::<Pubkey>::from(hook.authority),
        Some(c.vault),
        "l'autorite du hook reste au coffre"
    );
}

#[test]
fn les_comptes_de_detention_appartiennent_au_coffre() {
    let mut c = preparer();
    initialiser(&mut c);

    let actifs = compte_jeton(&c, &c.vault_assets);
    assert_eq!(actifs.owner, c.vault);
    assert_eq!(actifs.mint, c.deposit_mint);
    assert_eq!(actifs.amount, 0);

    let mortes = compte_jeton(&c, &c.dead_shares);
    assert_eq!(mortes.owner, c.vault);
    assert_eq!(mortes.mint, c.shares_mint);
    assert_eq!(
        mortes.amount, 0,
        "les parts mortes ne sont verrouillees qu'au premier depot"
    );
}

#[test]
fn seconde_initialisation_refusee() {
    let mut c = preparer();
    initialiser(&mut c);

    let ix = instruction_initialize(&c);
    let admin = c.admin.insecure_clone();
    assert!(
        envoyer(&mut c.svm, &[ix], &admin, &[]).is_err(),
        "un second appel doit echouer : le coffre est fige a l'initialisation"
    );
}
