//! Socle partage par les tests d'integration LiteSVM.
//!
//! Ce module vit sous `tests/` et NON sous `src/` : `CARGO_TARGET_TMPDIR`
//! n'est defini que pour les cibles de test d'integration, et la bibliotheque
//! ne compile pas si elle y fait appel.
//!
//! Ces tests ne sont pas mesures par la couverture (le programme s'execute en
//! BPF, cf. verdict S2) : ils disent ce que le cablage FAIT, la ou le module
//! d'arithmetique dit ce qu'il CALCULE.

#![allow(dead_code)] // chaque fichier de test n'utilise qu'une partie du socle

use {
    anchor_lang::{InstructionData, ToAccountMetas},
    litesvm::LiteSVM,
    solana_instruction::Instruction,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_program_pack::Pack,
    solana_pubkey::Pubkey,
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    spl_token_2022::extension::{BaseStateWithExtensions, ExtensionType, StateWithExtensions},
    std::path::PathBuf,
};

pub const DECIMALES: u8 = 6;

/// Lit le `.so` du programme, quel que soit le repertoire cible en vigueur.
///
/// L'ossature generee par `anchor init` code le chemin en dur :
///
/// ```ignore
/// include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/prog.so"))
/// ```
///
/// Ca marche sous `cargo test` et CASSE sous tout outil qui redirige le
/// repertoire cible. `cargo-llvm-cov` le fait (`--target-dir
/// target/llvm-cov-target`) : `CARGO_TARGET_TMPDIR` devient
/// `target/llvm-cov-target/tmp`, `../deploy` designe un repertoire vide, et la
/// compilation echoue sur un « No such file or directory » qui ne nomme pas sa
/// cause. `anchor build` ecrit TOUJOURS dans `<workspace>/target/deploy`.
///
/// Correction : lecture a l'EXECUTION plutot qu'a la compilation, les deux
/// emplacements essayes dans l'ordre. `include_bytes!` ne peut pas etre rendu
/// conditionnel, la macro exigeant un chemin litteral connu a la compilation.
pub fn program_binary(name: &str) -> Vec<u8> {
    let tmp = PathBuf::from(env!("CARGO_TARGET_TMPDIR"));
    let file = format!("{name}.so");
    // 1. cargo test     : <ws>/target/tmp/../deploy
    // 2. cargo llvm-cov : <ws>/target/llvm-cov-target/tmp/../../deploy
    let candidates = [
        tmp.join("..").join("deploy").join(&file),
        tmp.join("..").join("..").join("deploy").join(&file),
    ];
    for path in &candidates {
        if let Ok(bytes) = std::fs::read(path) {
            return bytes;
        }
    }
    panic!(
        "binaire {file} introuvable. Lancer `anchor build` d'abord. Chemins essayes : {}",
        candidates
            .iter()
            .map(|p| p.display().to_string())
            .collect::<Vec<_>>()
            .join(", ")
    );
}

pub struct Contexte {
    pub svm: LiteSVM,
    pub admin: Keypair,
    pub deposit_mint: Pubkey,
    pub hook_program: Pubkey,
    pub vault: Pubkey,
    pub shares_mint: Pubkey,
    pub vault_assets: Pubkey,
    pub dead_shares: Pubkey,
}

/// Simulateur avec le programme charge et un mint d'actif SPL CLASSIQUE, comme
/// le sont USDC et EURC sur devnet.
pub fn preparer() -> Contexte {
    let program_id = yield_vault::id();
    let mut svm = LiteSVM::new();
    svm.add_program(program_id, &program_binary("yield_vault"))
        .unwrap();

    let admin = Keypair::new();
    svm.airdrop(&admin.pubkey(), 100_000_000_000).unwrap();

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

/// Initialise le coffre. Rend le contexte pret pour un depot.
pub fn initialiser(c: &mut Contexte) {
    let ix = instruction_initialize(c);
    let admin = c.admin.insecure_clone();
    envoyer(&mut c.svm, &[ix], &admin, &[]).expect("initialisation refusee");
}

/// Cree un compte de jeton SPL classique et y frappe `montant`.
pub fn compte_actif_approvisionne(c: &mut Contexte, proprietaire: &Pubkey, montant: u64) -> Pubkey {
    let kp = Keypair::new();
    let space = spl_token::state::Account::LEN;
    let lamports = c.svm.minimum_balance_for_rent_exemption(space);
    let admin = c.admin.insecure_clone();
    let creer = solana_system_interface::instruction::create_account(
        &admin.pubkey(),
        &kp.pubkey(),
        lamports,
        space as u64,
        &spl_token::id(),
    );
    let init = spl_token::instruction::initialize_account3(
        &spl_token::id(),
        &kp.pubkey(),
        &c.deposit_mint,
        proprietaire,
    )
    .unwrap();
    let frapper = spl_token::instruction::mint_to(
        &spl_token::id(),
        &c.deposit_mint,
        &kp.pubkey(),
        &admin.pubkey(),
        &[],
        montant,
    )
    .unwrap();
    envoyer(&mut c.svm, &[creer, init, frapper], &admin, &[&kp])
        .expect("approvisionnement du deposant refuse");
    kp.pubkey()
}

/// Cree un compte de parts Token-2022. Le mint portant l'extension de hook, le
/// compte porte obligatoirement `TransferHookAccount` : sa taille doit en tenir
/// compte, sinon Token-2022 refuse l'initialisation.
pub fn compte_de_parts(c: &mut Contexte, proprietaire: &Pubkey) -> Pubkey {
    let kp = Keypair::new();
    let space = ExtensionType::try_calculate_account_len::<spl_token_2022::state::Account>(&[
        ExtensionType::TransferHookAccount,
    ])
    .unwrap();
    let lamports = c.svm.minimum_balance_for_rent_exemption(space);
    let admin = c.admin.insecure_clone();
    let creer = solana_system_interface::instruction::create_account(
        &admin.pubkey(),
        &kp.pubkey(),
        lamports,
        space as u64,
        &spl_token_2022::id(),
    );
    let init = spl_token_2022::instruction::initialize_account3(
        &spl_token_2022::id(),
        &kp.pubkey(),
        &c.shares_mint,
        proprietaire,
    )
    .unwrap();
    envoyer(&mut c.svm, &[creer, init], &admin, &[&kp])
        .expect("creation du compte de parts refusee");
    kp.pubkey()
}

/// Solde d'un compte de jeton, quel que soit son programme.
pub fn solde(c: &Contexte, compte: &Pubkey) -> u64 {
    compte_jeton(c, compte).amount
}

/// Offre du mint des parts.
pub fn offre_des_parts(c: &Contexte) -> u64 {
    mint_de_parts(c).supply
}

/// Etat du coffre, deserialise.
pub fn lire_coffre(c: &Contexte) -> yield_vault::state::Vault {
    use anchor_lang::AccountDeserialize;
    let acc = c.svm.get_account(&c.vault).expect("coffre absent");
    let mut data: &[u8] = &acc.data;
    yield_vault::state::Vault::try_deserialize(&mut data).expect("coffre illisible")
}

/// Extension de hook du mint des parts.
pub fn hook_du_mint(c: &Contexte) -> spl_token_2022::extension::transfer_hook::TransferHook {
    let acc = c.svm.get_account(&c.shares_mint).expect("mint absent");
    let etat = StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&acc.data).unwrap();
    *etat
        .get_extension::<spl_token_2022::extension::transfer_hook::TransferHook>()
        .expect("extension de hook absente")
}

/// Etat de base du mint des parts.
pub fn mint_de_parts(c: &Contexte) -> spl_token_2022::state::Mint {
    let acc = c.svm.get_account(&c.shares_mint).expect("mint absent");
    StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&acc.data)
        .unwrap()
        .base
}

/// Etat de base d'un compte de jeton.
pub fn compte_jeton(c: &Contexte, compte: &Pubkey) -> spl_token_2022::state::Account {
    let acc = c.svm.get_account(compte).expect("compte absent");
    StateWithExtensions::<spl_token_2022::state::Account>::unpack(&acc.data)
        .unwrap()
        .base
}

/// Proprietaire du compte brut, pour distinguer Token-2022 du SPL classique.
pub fn proprietaire_de_compte(c: &Contexte, compte: &Pubkey) -> Pubkey {
    c.svm.get_account(compte).expect("compte absent").owner
}

/// Code d'erreur Anchor porte par une transaction refusee.
///
/// Sans cette lecture, un test negatif se contente de `is_err()` et passe pour
/// n'importe quelle raison : un `todo!()` non implemente, une contrainte de
/// compte mal cablee ou un refus legitime y sont indiscernables. C'est
/// exactement ce qui s'est produit au rouge de la tache 3.
pub fn code_erreur(e: &litesvm::types::FailedTransactionMetadata) -> Option<u32> {
    use solana_instruction::error::InstructionError;
    use solana_transaction_error::TransactionError;
    match &e.err {
        TransactionError::InstructionError(_, InstructionError::Custom(code)) => Some(*code),
        _ => None,
    }
}

/// Code Anchor d'une variante de `VaultError`. Anchor decale les erreurs
/// utilisateur de 6000.
pub fn code_de(e: yield_vault::error::VaultError) -> u32 {
    6000 + e as u32
}
