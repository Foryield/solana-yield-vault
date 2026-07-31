//! Socle partage par les tests du module de conformite.
//!
//! Le mint construit ici porte reellement l'extension de hook pointant vers le
//! programme : c'est la seule facon d'eprouver ce que Token-2022 fera, plutot
//! que ce que nous croyons qu'il fera.

#![allow(dead_code)] // chaque fichier n'utilise qu'une partie du socle

use {
    anchor_lang::{InstructionData, ToAccountMetas},
    litesvm::LiteSVM,
    solana_instruction::Instruction,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_pubkey::Pubkey,
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    spl_token_2022::extension::{ExtensionType, StateWithExtensions},
    std::path::PathBuf,
};

pub const DECIMALES: u8 = 6;

pub fn program_binary(name: &str) -> Vec<u8> {
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

pub struct Contexte {
    pub svm: LiteSVM,
    pub payeur: Keypair,
    pub autorite: Keypair,
    pub mint: Pubkey,
    pub config: Pubkey,
    pub metas: Pubkey,
}

/// Simulateur avec le hook charge et un mint Token-2022 portant l'extension
/// pointant vers lui.
pub fn preparer() -> Contexte {
    let program_id = compliance_hook::id();
    let mut svm = LiteSVM::new();
    svm.add_program(program_id, &program_binary("compliance_hook"))
        .unwrap();

    let payeur = Keypair::new();
    let autorite = Keypair::new();
    svm.airdrop(&payeur.pubkey(), 100_000_000_000).unwrap();

    let mint_kp = Keypair::new();
    let space = ExtensionType::try_calculate_account_len::<spl_token_2022::state::Mint>(&[
        ExtensionType::TransferHook,
    ])
    .unwrap();
    let lamports = svm.minimum_balance_for_rent_exemption(space);
    let creer = solana_system_interface::instruction::create_account(
        &payeur.pubkey(),
        &mint_kp.pubkey(),
        lamports,
        space as u64,
        &spl_token_2022::id(),
    );
    let init_hook = spl_token_2022::extension::transfer_hook::instruction::initialize(
        &spl_token_2022::id(),
        &mint_kp.pubkey(),
        Some(payeur.pubkey()),
        Some(program_id),
    )
    .unwrap();
    let init_mint = spl_token_2022::instruction::initialize_mint2(
        &spl_token_2022::id(),
        &mint_kp.pubkey(),
        &payeur.pubkey(),
        None,
        DECIMALES,
    )
    .unwrap();
    envoyer(
        &mut svm,
        &[creer, init_hook, init_mint],
        &payeur,
        &[&mint_kp],
    )
    .expect("creation du mint a hook refusee");

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

pub fn envoyer(
    svm: &mut LiteSVM,
    instructions: &[Instruction],
    payeur: &Keypair,
    autres: &[&Keypair],
) -> Result<(), Box<litesvm::types::FailedTransactionMetadata>> {
    // Le bloc de reference est avance a chaque envoi. Sans cela, deux
    // transactions identiques (memes instructions, memes signataires) portent
    // la meme signature et la seconde est rejetee en « AlreadyProcessed » : un
    // echec de HARNAIS qu'on lit a tort comme un refus du programme.
    svm.expire_blockhash();
    let bh = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(instructions, Some(&payeur.pubkey()), &bh);
    let mut signataires: Vec<&Keypair> = vec![payeur];
    signataires.extend_from_slice(autres);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &signataires).unwrap();
    svm.send_transaction(tx).map(|_| ()).map_err(Box::new)
}

pub fn instruction_initialize(c: &Contexte) -> Instruction {
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

pub fn attacher(c: &mut Contexte) -> Result<(), Box<litesvm::types::FailedTransactionMetadata>> {
    let ix = instruction_initialize(c);
    let payeur = c.payeur.insecure_clone();
    let autorite = c.autorite.insecure_clone();
    envoyer(&mut c.svm, &[ix], &payeur, &[&autorite])
}

/// Adresse de l'entree de liste d'un porteur.
pub fn entree_de(c: &Contexte, porteur: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[
            compliance_hook::state::ALLOW_SEED,
            c.mint.as_ref(),
            porteur.as_ref(),
        ],
        &compliance_hook::id(),
    )
    .0
}

pub fn autoriser(
    c: &mut Contexte,
    porteur: &Pubkey,
) -> Result<(), Box<litesvm::types::FailedTransactionMetadata>> {
    autoriser_par(c, porteur, &c.autorite.insecure_clone())
}

pub fn autoriser_par(
    c: &mut Contexte,
    porteur: &Pubkey,
    autorite: &Keypair,
) -> Result<(), Box<litesvm::types::FailedTransactionMetadata>> {
    let ix = Instruction::new_with_bytes(
        compliance_hook::id(),
        &compliance_hook::instruction::Allow { holder: *porteur }.data(),
        compliance_hook::accounts::Allow {
            payer: c.payeur.pubkey(),
            config: c.config,
            authority: autorite.pubkey(),
            entry: entree_de(c, porteur),
            system_program: solana_system_interface::program::id(),
        }
        .to_account_metas(None),
    );
    let payeur = c.payeur.insecure_clone();
    let a = autorite.insecure_clone();
    envoyer(&mut c.svm, &[ix], &payeur, &[&a])
}

pub fn revoquer_par(
    c: &mut Contexte,
    porteur: &Pubkey,
    autorite: &Keypair,
) -> Result<(), Box<litesvm::types::FailedTransactionMetadata>> {
    let ix = Instruction::new_with_bytes(
        compliance_hook::id(),
        &compliance_hook::instruction::Revoke { holder: *porteur }.data(),
        compliance_hook::accounts::Revoke {
            config: c.config,
            authority: autorite.pubkey(),
            entry: entree_de(c, porteur),
        }
        .to_account_metas(None),
    );
    let payeur = c.payeur.insecure_clone();
    let a = autorite.insecure_clone();
    envoyer(&mut c.svm, &[ix], &payeur, &[&a])
}

/// Cree un compte de parts pour `proprietaire` et y frappe `montant`.
pub fn compte_de_parts(c: &mut Contexte, proprietaire: &Pubkey, montant: u64) -> Pubkey {
    let kp = Keypair::new();
    let space = ExtensionType::try_calculate_account_len::<spl_token_2022::state::Account>(&[
        ExtensionType::TransferHookAccount,
    ])
    .unwrap();
    let lamports = c.svm.minimum_balance_for_rent_exemption(space);
    let payeur = c.payeur.insecure_clone();
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
        &c.mint,
        proprietaire,
    )
    .unwrap();
    let mut ixs = vec![creer, init];
    if montant > 0 {
        ixs.push(
            spl_token_2022::instruction::mint_to(
                &spl_token_2022::id(),
                &c.mint,
                &kp.pubkey(),
                &payeur.pubkey(),
                &[],
                montant,
            )
            .unwrap(),
        );
    }
    envoyer(&mut c.svm, &ixs, &payeur, &[&kp]).expect("creation du compte de parts refusee");
    kp.pubkey()
}

pub fn solde(c: &Contexte, compte: &Pubkey) -> u64 {
    let acc = c.svm.get_account(compte).expect("compte absent");
    StateWithExtensions::<spl_token_2022::state::Account>::unpack(&acc.data)
        .unwrap()
        .base
        .amount
}

pub fn code_erreur(e: &litesvm::types::FailedTransactionMetadata) -> Option<u32> {
    use solana_instruction::error::InstructionError;
    use solana_transaction_error::TransactionError;
    match &e.err {
        TransactionError::InstructionError(_, InstructionError::Custom(code)) => Some(*code),
        _ => None,
    }
}

pub fn code_de(e: compliance_hook::error::HookError) -> u32 {
    6000 + e as u32
}
