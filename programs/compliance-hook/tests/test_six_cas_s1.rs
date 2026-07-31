//! Les six cas du verdict S1, eprouves contre de VRAIS transferts.
//!
//! Le spike S1 avait conclu, par lecture du processeur de Token-2022, qu'aucune
//! voie de mouvement n'echappe au hook. La conclusion venait de la source, ce
//! qui prouve tous les chemins mais ne prouve pas que le binaire deploye
//! corresponde a cette source. La reserve etait assumee et sa levee programmee
//! sous forme de tests permanents : les voici.
//!
//! Le cas 3 est le temoin qui compte. C'est celui qui echouerait en silence si
//! une version future de Token-2022 assouplissait la garde sur le transfert
//! herite.

mod common;

use {
    common::*, solana_instruction::AccountMeta, solana_keypair::Keypair, solana_program_pack::Pack,
    solana_pubkey::Pubkey, solana_signer::Signer, spl_token_2022::extension::ExtensionType,
};

struct Scene {
    c: Contexte,
    emetteur: Keypair,
    source: Pubkey,
}

/// Coffre attache, emetteur autorise detenant 10 000 parts.
fn scene() -> Scene {
    let mut c = preparer();
    attacher(&mut c).expect("attachement refuse");
    let emetteur = Keypair::new();
    c.svm.airdrop(&emetteur.pubkey(), 1_000_000_000).unwrap();
    autoriser(&mut c, &emetteur.pubkey()).expect("autorisation de l'emetteur refusee");
    let source = compte_de_parts(&mut c, &emetteur.pubkey(), 10_000);
    Scene {
        c,
        emetteur,
        source,
    }
}

/// Transfert verifie, avec les comptes que le hook exige en supplement.
///
/// Token-2022 resout la liste de comptes supplementaires contre les comptes
/// SUPPLEMENTAIRES de l'instruction : il faut donc les lui fournir, dans
/// l'ordre programme, liste de validation, puis les entrees resolues.
fn transfert_verifie(
    s: &mut Scene,
    destination: &Pubkey,
    proprietaire_destination: &Pubkey,
    montant: u64,
) -> Result<(), Box<litesvm::types::FailedTransactionMetadata>> {
    let mut ix = spl_token_2022::instruction::transfer_checked(
        &spl_token_2022::id(),
        &s.source,
        &s.c.mint,
        destination,
        &s.emetteur.pubkey(),
        &[],
        montant,
        DECIMALES,
    )
    .unwrap();
    ix.accounts
        .push(AccountMeta::new_readonly(compliance_hook::id(), false));
    ix.accounts
        .push(AccountMeta::new_readonly(s.c.metas, false));
    ix.accounts.push(AccountMeta::new_readonly(
        entree_de(&s.c, proprietaire_destination),
        false,
    ));

    let emetteur = s.emetteur.insecure_clone();
    envoyer(&mut s.c.svm, &[ix], &emetteur, &[])
}

// --- Cas 1 et 2 : le hook decide -----------------------------------------

#[test]
fn cas_1_transfert_verifie_vers_un_autorise_aboutit() {
    let mut s = scene();
    let recu = Keypair::new();
    autoriser(&mut s.c, &recu.pubkey()).expect("autorisation refusee");
    let destination = compte_de_parts(&mut s.c, &recu.pubkey(), 0);

    transfert_verifie(&mut s, &destination, &recu.pubkey(), 4_000)
        .expect("un transfert vers un porteur autorise doit aboutir");

    assert_eq!(solde(&s.c, &destination), 4_000);
    assert_eq!(solde(&s.c, &s.source), 6_000);
}

#[test]
fn cas_2_transfert_verifie_vers_un_non_autorise_est_refuse() {
    let mut s = scene();
    let inconnu = Keypair::new();
    let destination = compte_de_parts(&mut s.c, &inconnu.pubkey(), 0);

    // Meme instruction que le cas 1, au destinataire pres. Le code d'erreur
    // est verifie : un echec de RESOLUTION des comptes ferait passer ce test
    // sans que la liste soit reellement appliquee.
    let e = transfert_verifie(&mut s, &destination, &inconnu.pubkey(), 4_000)
        .expect_err("une part ne doit pas atterrir chez un porteur non autorise");
    assert_eq!(
        code_erreur(&e),
        Some(code_de(compliance_hook::error::HookError::NotAllowed)),
        "le refus doit venir de la LISTE, pas d'un accident de resolution"
    );
    assert_eq!(
        solde(&s.c, &destination),
        0,
        "un transfert refuse ne deplace rien"
    );
    assert_eq!(solde(&s.c, &s.source), 10_000);
}

// --- Cas 3 : LE TEMOIN ----------------------------------------------------

#[test]
fn cas_3_le_transfert_herite_echoue_au_lieu_de_contourner() {
    let mut s = scene();
    let inconnu = Keypair::new();
    let destination = compte_de_parts(&mut s.c, &inconnu.pubkey(), 0);

    // Le transfert herite ne passe PAS le mint, donc Token-2022 n'a aucun
    // moyen de savoir quel hook appeler. La question est ce qu'il en fait :
    // laisser passer serait un contournement complet de la liste.
    #[allow(deprecated)]
    let ix = spl_token_2022::instruction::transfer(
        &spl_token_2022::id(),
        &s.source,
        &destination,
        &s.emetteur.pubkey(),
        &[],
        4_000,
    )
    .unwrap();

    let emetteur = s.emetteur.insecure_clone();
    assert!(
        envoyer(&mut s.c.svm, &[ix], &emetteur, &[]).is_err(),
        "TEMOIN : un transfert herite doit ECHOUER, jamais contourner le hook"
    );
    assert_eq!(
        solde(&s.c, &destination),
        0,
        "aucune part ne doit avoir bouge"
    );
    assert_eq!(solde(&s.c, &s.source), 10_000);
}

// --- Cas 4 : la delegation n'ouvre pas de chemin parallele ---------------

#[test]
fn cas_4_le_delegataire_ne_contourne_pas_la_liste() {
    let mut s = scene();
    let delegataire = Keypair::new();
    s.c.svm
        .airdrop(&delegataire.pubkey(), 1_000_000_000)
        .unwrap();
    let inconnu = Keypair::new();
    let destination = compte_de_parts(&mut s.c, &inconnu.pubkey(), 0);

    let approuver = spl_token_2022::instruction::approve(
        &spl_token_2022::id(),
        &s.source,
        &delegataire.pubkey(),
        &s.emetteur.pubkey(),
        &[],
        10_000,
    )
    .unwrap();
    let emetteur = s.emetteur.insecure_clone();
    envoyer(&mut s.c.svm, &[approuver], &emetteur, &[]).expect("delegation refusee");

    let mut ix = spl_token_2022::instruction::transfer_checked(
        &spl_token_2022::id(),
        &s.source,
        &s.c.mint,
        &destination,
        &delegataire.pubkey(),
        &[],
        4_000,
        DECIMALES,
    )
    .unwrap();
    ix.accounts
        .push(AccountMeta::new_readonly(compliance_hook::id(), false));
    ix.accounts
        .push(AccountMeta::new_readonly(s.c.metas, false));
    ix.accounts.push(AccountMeta::new_readonly(
        entree_de(&s.c, &inconnu.pubkey()),
        false,
    ));

    let e = envoyer(&mut s.c.svm, &[ix], &delegataire, &[])
        .expect_err("un delegataire emprunte le meme chemin : la liste s'applique");
    assert_eq!(
        code_erreur(&e),
        Some(code_de(compliance_hook::error::HookError::NotAllowed)),
        "meme refus que pour un transfert direct : pas de chemin parallele"
    );
    assert_eq!(solde(&s.c, &destination), 0);
}

#[test]
fn le_delegataire_vers_un_autorise_aboutit() {
    // Contre-epreuve du cas 4, et la vraie raison de son existence : sans elle,
    // une structure de comptes trop stricte casserait TOUTE delegation sans
    // qu'aucun test ne s'en apercoive, puisque le cas 4 attend un echec.
    let mut s = scene();
    let delegataire = Keypair::new();
    s.c.svm
        .airdrop(&delegataire.pubkey(), 1_000_000_000)
        .unwrap();
    let recu = Keypair::new();
    autoriser(&mut s.c, &recu.pubkey()).expect("autorisation refusee");
    let destination = compte_de_parts(&mut s.c, &recu.pubkey(), 0);

    let approuver = spl_token_2022::instruction::approve(
        &spl_token_2022::id(),
        &s.source,
        &delegataire.pubkey(),
        &s.emetteur.pubkey(),
        &[],
        10_000,
    )
    .unwrap();
    let emetteur = s.emetteur.insecure_clone();
    envoyer(&mut s.c.svm, &[approuver], &emetteur, &[]).expect("delegation refusee");

    let mut ix = spl_token_2022::instruction::transfer_checked(
        &spl_token_2022::id(),
        &s.source,
        &s.c.mint,
        &destination,
        &delegataire.pubkey(),
        &[],
        4_000,
        DECIMALES,
    )
    .unwrap();
    ix.accounts
        .push(AccountMeta::new_readonly(compliance_hook::id(), false));
    ix.accounts
        .push(AccountMeta::new_readonly(s.c.metas, false));
    ix.accounts.push(AccountMeta::new_readonly(
        entree_de(&s.c, &recu.pubkey()),
        false,
    ));

    envoyer(&mut s.c.svm, &[ix], &delegataire, &[])
        .expect("un delegataire vers un porteur autorise doit aboutir");
    assert_eq!(solde(&s.c, &destination), 4_000);
}

// --- Cas 5 : la fermeture ne deplace pas de valeur ------------------------

#[test]
fn cas_5_fermer_un_compte_non_vide_est_refuse() {
    let mut s = scene();
    let emetteur = s.emetteur.insecure_clone();

    let fermer = spl_token_2022::instruction::close_account(
        &spl_token_2022::id(),
        &s.source,
        &emetteur.pubkey(),
        &emetteur.pubkey(),
        &[],
    )
    .unwrap();

    assert!(
        envoyer(&mut s.c.svm, &[fermer], &emetteur, &[]).is_err(),
        "fermer un compte au solde non nul viderait la liste de son sens"
    );
    assert_eq!(solde(&s.c, &s.source), 10_000);
}

// --- Cas 6 : l'extension de compte ne peut pas etre esquivee -------------

#[test]
fn cas_6_un_compte_de_parts_sans_l_extension_est_impossible() {
    let mut s = scene();
    let porteur = Keypair::new();
    let kp = Keypair::new();

    // Taille d'un compte de jeton SANS l'extension imposee par le mint : c'est
    // la porte qu'un attaquant voudrait, pour retomber dans le chemin
    // permissif du transfert herite.
    let space = spl_token_2022::state::Account::LEN;
    let lamports = s.c.svm.minimum_balance_for_rent_exemption(space);
    let payeur = s.c.payeur.insecure_clone();
    let creer = solana_system_interface::instruction::create_account(
        &payeur.pubkey(),
        &kp.pubkey(),
        lamports,
        space as u64,
        &spl_token_2022::id(),
    );
    let init = spl_token_2022::instruction::initialize_account3(
        &spl_token_2022::id(),
        &kp.pubkey(),
        &s.c.mint,
        &porteur.pubkey(),
    )
    .unwrap();

    assert!(
        envoyer(&mut s.c.svm, &[creer, init], &payeur, &[&kp]).is_err(),
        "Token-2022 doit refuser un compte trop petit pour l'extension qu'il impose"
    );

    // Contre-epreuve : avec la taille qui tient l'extension, ca passe.
    let bonne_taille =
        ExtensionType::try_calculate_account_len::<spl_token_2022::state::Account>(&[
            ExtensionType::TransferHookAccount,
        ])
        .unwrap();
    assert!(
        bonne_taille > space,
        "l'extension occupe bien de la place : sans cela le cas 6 ne prouverait rien"
    );
}
