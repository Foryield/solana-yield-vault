//! Initialisation du coffre, eprouvee par comportement sous LiteSVM.
//!
//! Ces tests ne sont pas mesures par la couverture (le programme s'execute en
//! BPF, cf. verdict S2) : ils disent ce que le cablage FAIT, la ou le module
//! d'arithmetique dit ce qu'il CALCULE.

mod common;

use {
    anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas},
    litesvm::LiteSVM,
    solana_instruction::Instruction,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_program_pack::Pack,
    solana_pubkey::Pubkey,
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    spl_token_2022::extension::BaseStateWithExtensions,
};

const DECIMALES: u8 = 6;

struct Contexte {
    svm: LiteSVM,
    admin: Keypair,
    deposit_mint: Pubkey,
    hook_program: Pubkey,
    vault: Pubkey,
    shares_mint: Pubkey,
    vault_assets: Pubkey,
    dead_shares: Pubkey,
}

/// Prepare un simulateur avec le programme charge et un mint d'actif SPL
/// CLASSIQUE, comme le sont USDC et EURC sur devnet.
fn preparer() -> Contexte {
    let program_id = yield_vault::id();
    let mut svm = LiteSVM::new();
    svm.add_program(program_id, &common::program_binary("yield_vault"))
        .unwrap();

    let admin = Keypair::new();
    svm.airdrop(&admin.pubkey(), 100_000_000_000).unwrap();

    // Mint de l'actif depose, programme SPL classique.
    let mint_kp = Keypair::new();
    let space = spl_token::state::Mint::LEN;
    let lamports = svm.minimum_balance_for_rent_exemption(space);
    let creer = solana_system_interface::instruction::create_account(
        &admin.pubkey(),
        &mint_kp.pubkey(),
        lamports,
        space as u64,
        &spl_token::id(),
    );
    let initialiser = spl_token::instruction::initialize_mint2(
        &spl_token::id(),
        &mint_kp.pubkey(),
        &admin.pubkey(),
        None,
        DECIMALES,
    )
    .unwrap();
    envoyer(&mut svm, &[creer, initialiser], &admin, &[&mint_kp])
        .expect("creation du mint d'actif refusee");

    let deposit_mint = mint_kp.pubkey();
    let hook_program = Pubkey::new_unique();
    let (vault, _) = Pubkey::find_program_address(
        &[yield_vault::state::VAULT_SEED, deposit_mint.as_ref()],
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

    Contexte {
        svm,
        admin,
        deposit_mint,
        hook_program,
        vault,
        shares_mint,
        vault_assets,
        dead_shares,
    }
}

fn envoyer(
    svm: &mut LiteSVM,
    instructions: &[Instruction],
    payeur: &Keypair,
    autres: &[&Keypair],
) -> Result<(), Box<litesvm::types::FailedTransactionMetadata>> {
    let bh = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(instructions, Some(&payeur.pubkey()), &bh);
    let mut signataires: Vec<&Keypair> = vec![payeur];
    signataires.extend_from_slice(autres);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &signataires).unwrap();
    svm.send_transaction(tx).map(|_| ()).map_err(Box::new)
}

fn instruction_initialize(c: &Contexte) -> Instruction {
    Instruction::new_with_bytes(
        yield_vault::id(),
        &yield_vault::instruction::Initialize {
            hook_program: c.hook_program,
        }
        .data(),
        yield_vault::accounts::Initialize {
            admin: c.admin.pubkey(),
            deposit_mint: c.deposit_mint,
            vault: c.vault,
            shares_mint: c.shares_mint,
            vault_assets: c.vault_assets,
            dead_shares: c.dead_shares,
            shares_token_program: spl_token_2022::id(),
            deposit_token_program: spl_token::id(),
            system_program: solana_system_interface::program::id(),
        }
        .to_account_metas(None),
    )
}

#[test]
fn initialisation_pose_l_etat_du_coffre() {
    let mut c = preparer();
    let ix = instruction_initialize(&c);
    let admin = c.admin.insecure_clone();
    envoyer(&mut c.svm, &[ix], &admin, &[]).expect("initialisation refusee");

    let compte = c.svm.get_account(&c.vault).expect("coffre absent");
    let mut data: &[u8] = &compte.data;
    let vault = yield_vault::state::Vault::try_deserialize(&mut data).unwrap();

    assert_eq!(vault.admin, admin.pubkey());
    assert_eq!(vault.deposit_mint, c.deposit_mint);
    assert_eq!(vault.shares_mint, c.shares_mint);
    assert_eq!(vault.hook_program, c.hook_program);
    assert!(!vault.paused, "un coffre neuf ne doit pas naitre suspendu");
}

#[test]
fn le_mint_des_parts_porte_le_hook_et_l_autorite_du_coffre() {
    let mut c = preparer();
    let ix = instruction_initialize(&c);
    let admin = c.admin.insecure_clone();
    envoyer(&mut c.svm, &[ix], &admin, &[]).expect("initialisation refusee");

    let compte = c.svm.get_account(&c.shares_mint).expect("mint absent");
    assert_eq!(
        compte.owner,
        spl_token_2022::id(),
        "les parts doivent etre un mint Token-2022"
    );

    let etat =
        spl_token_2022::extension::StateWithExtensions::<spl_token_2022::state::Mint>::unpack(
            &compte.data,
        )
        .unwrap();

    assert_eq!(
        etat.base.decimals, DECIMALES,
        "decimales alignees sur l'actif"
    );
    assert_eq!(
        Option::<Pubkey>::from(etat.base.mint_authority),
        Some(c.vault),
        "seul le coffre doit pouvoir emettre des parts"
    );

    let hook = etat
        .get_extension::<spl_token_2022::extension::transfer_hook::TransferHook>()
        .expect("extension de hook absente");
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
    let ix = instruction_initialize(&c);
    let admin = c.admin.insecure_clone();
    envoyer(&mut c.svm, &[ix], &admin, &[]).expect("initialisation refusee");

    let actifs = c
        .svm
        .get_account(&c.vault_assets)
        .expect("compte d'actif absent");
    let etat_actifs = spl_token_2022::extension::StateWithExtensions::<
        spl_token_2022::state::Account,
    >::unpack(&actifs.data)
    .unwrap();
    assert_eq!(etat_actifs.base.owner, c.vault);
    assert_eq!(etat_actifs.base.mint, c.deposit_mint);
    assert_eq!(etat_actifs.base.amount, 0);

    let mortes = c
        .svm
        .get_account(&c.dead_shares)
        .expect("compte mort absent");
    let etat_mortes = spl_token_2022::extension::StateWithExtensions::<
        spl_token_2022::state::Account,
    >::unpack(&mortes.data)
    .unwrap();
    assert_eq!(etat_mortes.base.owner, c.vault);
    assert_eq!(etat_mortes.base.mint, c.shares_mint);
    assert_eq!(
        etat_mortes.base.amount, 0,
        "les parts mortes ne sont verrouillees qu'au premier depot"
    );
}

#[test]
fn seconde_initialisation_refusee() {
    let mut c = preparer();
    let admin = c.admin.insecure_clone();
    let ix = instruction_initialize(&c);
    envoyer(&mut c.svm, &[ix], &admin, &[]).expect("premiere initialisation refusee");

    let ix2 = instruction_initialize(&c);
    let resultat = envoyer(&mut c.svm, &[ix2], &admin, &[]);
    assert!(
        resultat.is_err(),
        "un second appel doit echouer : le coffre est fige a l'initialisation"
    );
}
