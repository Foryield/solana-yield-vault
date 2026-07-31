//! Attachement du hook a un mint, eprouve sous LiteSVM.
//!
//! Ce que ces tests peuvent prouver : la configuration est posee, et la liste
//! de comptes supplementaires est ecrite au format que Token-2022 sait relire.
//!
//! Ce qu'ils ne peuvent PAS prouver : que la derivation depuis les donnees du
//! compte de destination designe la bonne entree. Seul un vrai transfert le
//! dira, puisque c'est Token-2022 qui derive. Ce sera la tache 4.

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
    spl_tlv_account_resolution::state::ExtraAccountMetaList,
    spl_transfer_hook_interface::instruction::ExecuteInstruction,
    spl_type_length_value::state::TlvStateBorrowed,
    std::path::PathBuf,
};

fn program_binary(name: &str) -> Vec<u8> {
    let tmp = PathBuf::from(env!("CARGO_TARGET_TMPDIR"));
    let file = format!("{name}.so");
    let candidates = [
        tmp.join("..").join("deploy").join(&file),
        tmp.join("..").join("..").join("deploy").join(&file),
    ];
    for path in &candidates {
        if let Ok(bytes) = std::fs::read(path) {
            return bytes;
        }
    }
    panic!("binaire {file} introuvable. Lancer `anchor build` d'abord.");
}

struct Contexte {
    svm: LiteSVM,
    payeur: Keypair,
    autorite: Keypair,
    mint: Pubkey,
    config: Pubkey,
    metas: Pubkey,
}

fn preparer() -> Contexte {
    let program_id = compliance_hook::id();
    let mut svm = LiteSVM::new();
    svm.add_program(program_id, &program_binary("compliance_hook"))
        .unwrap();

    let payeur = Keypair::new();
    let autorite = Keypair::new();
    svm.airdrop(&payeur.pubkey(), 100_000_000_000).unwrap();

    // Un mint Token-2022 ordinaire suffit : le hook gouverne le mint qu'on lui
    // designe, c'est le mint qui choisit son hook et non l'inverse.
    let mint_kp = Keypair::new();
    let space = spl_token_2022::state::Mint::LEN;
    let lamports = svm.minimum_balance_for_rent_exemption(space);
    let creer = solana_system_interface::instruction::create_account(
        &payeur.pubkey(),
        &mint_kp.pubkey(),
        lamports,
        space as u64,
        &spl_token_2022::id(),
    );
    let init = spl_token_2022::instruction::initialize_mint2(
        &spl_token_2022::id(),
        &mint_kp.pubkey(),
        &payeur.pubkey(),
        None,
        6,
    )
    .unwrap();
    envoyer(&mut svm, &[creer, init], &payeur, &[&mint_kp]).expect("creation du mint refusee");

    let mint = mint_kp.pubkey();
    let (config, _) = Pubkey::find_program_address(
        &[compliance_hook::state::CONFIG_SEED, mint.as_ref()],
        &program_id,
    );
    let (metas, _) =
        Pubkey::find_program_address(&[b"extra-account-metas", mint.as_ref()], &program_id);

    Contexte {
        svm,
        payeur,
        autorite,
        mint,
        config,
        metas,
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
        compliance_hook::id(),
        &compliance_hook::instruction::Initialize {}.data(),
        compliance_hook::accounts::Initialize {
            payer: c.payeur.pubkey(),
            authority: c.autorite.pubkey(),
            mint: c.mint,
            config: c.config,
            extra_account_meta_list: c.metas,
            system_program: solana_system_interface::program::id(),
        }
        .to_account_metas(None),
    )
}

fn attacher(c: &mut Contexte) -> Result<(), Box<litesvm::types::FailedTransactionMetadata>> {
    let ix = instruction_initialize(c);
    let payeur = c.payeur.insecure_clone();
    let autorite = c.autorite.insecure_clone();
    envoyer(&mut c.svm, &[ix], &payeur, &[&autorite])
}

#[test]
fn l_attachement_pose_la_configuration() {
    let mut c = preparer();
    attacher(&mut c).expect("attachement refuse");

    let compte = c.svm.get_account(&c.config).expect("configuration absente");
    let mut data: &[u8] = &compte.data;
    let config = compliance_hook::state::HookConfig::try_deserialize(&mut data).unwrap();

    assert_eq!(config.mint, c.mint);
    assert_eq!(
        config.authority,
        c.autorite.pubkey(),
        "l'autorite de la liste est celle qui a signe, pas le payeur"
    );
}

#[test]
fn la_liste_de_comptes_est_relisible_par_l_interface() {
    let mut c = preparer();
    attacher(&mut c).expect("attachement refuse");

    let compte = c.svm.get_account(&c.metas).expect("liste absente");
    assert_eq!(
        compte.owner,
        compliance_hook::id(),
        "la liste doit appartenir au hook, c'est lui qui la sert"
    );

    // Relecture par la bibliotheque d'interface elle-meme, et non par un
    // decodage maison : ce qui compte est que TOKEN-2022 sache la lire.
    let tlv = TlvStateBorrowed::unpack(&compte.data).expect("format TLV illisible");
    let liste = ExtraAccountMetaList::unpack_with_tlv_state::<ExecuteInstruction>(&tlv)
        .expect("format illisible par l'interface de hook");
    assert_eq!(
        liste.len(),
        1,
        "une seule entree supplementaire : celle de la liste d'autorisation"
    );
}

#[test]
fn second_attachement_du_meme_mint_refuse() {
    let mut c = preparer();
    attacher(&mut c).expect("premier attachement refuse");

    assert!(
        attacher(&mut c).is_err(),
        "un mint ne peut etre attache qu'une fois : la configuration est figee"
    );
}

#[test]
fn l_autorite_doit_signer() {
    let mut c = preparer();
    let payeur = c.payeur.insecure_clone();

    // Meme instruction, mais l'autorite ne signe pas : on ne doit pas pouvoir
    // attacher un hook au nom de quelqu'un qui l'ignore.
    let mut ix = instruction_initialize(&c);
    for meta in ix.accounts.iter_mut() {
        if meta.pubkey == c.autorite.pubkey() {
            meta.is_signer = false;
        }
    }
    assert!(
        envoyer(&mut c.svm, &[ix], &payeur, &[]).is_err(),
        "l'autorite de la liste doit signer son propre engagement"
    );
}
