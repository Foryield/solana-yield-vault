//! Attache le hook a un mint.
//!
//! Deux comptes sont crees. La configuration, qui porte le mint gouverne et
//! l'autorite de la liste. Et la LISTE DE COMPTES SUPPLEMENTAIRES, qui est le
//! point delicat de tout le module.
//!
//! Token-2022 ne passe au hook que quatre comptes : source, mint, destination
//! et autorite de la source. L'entree de liste a verifier n'en fait pas
//! partie. Cette liste declare, une fois pour toutes, comment la DERIVER :
//! l'entree est un PDA dont la derniere graine est lue DANS LES DONNEES du
//! compte de destination, a l'emplacement de son proprietaire.
//!
//! Consequence, et c'est tout l'interet : le client n'a rien a calculer et ne
//! peut pas mentir sur l'adresse verifiee, puisque c'est Token-2022 qui derive
//! a partir du compte reellement credite.

use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

/// Decalage du proprietaire dans un compte de jeton SPL : le mint occupe les
/// 32 premiers octets, le proprietaire les 32 suivants. Cette disposition est
/// commune au programme classique et a Token-2022, les extensions se placant
/// APRES la partie de base.
const OWNER_OFFSET: u8 = 32;
const PUBKEY_LEN: u8 = 32;

/// Index du mint et du compte de destination dans l'instruction `Execute`,
/// tels que Token-2022 les passe : 0 source, 1 mint, 2 destination,
/// 3 autorite de la source, 4 liste de comptes supplementaires.
const MINT_INDEX: u8 = 1;
const DESTINATION_INDEX: u8 = 2;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Autorite de la liste d'autorisation. Signe pour eviter qu'on attache un
    /// hook au nom de quelqu'un qui l'ignore.
    pub authority: Signer<'info>,

    /// Mint gouverne. Aucune verification de son extension ici : ce programme
    /// gouverne le mint qu'on lui designe, et c'est le mint qui choisit son
    /// hook, pas l'inverse.
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init,
        payer = payer,
        space = 8 + HookConfig::INIT_SPACE,
        seeds = [CONFIG_SEED, mint.key().as_ref()],
        bump,
    )]
    pub config: Box<Account<'info, HookConfig>>,

    /// Liste de comptes supplementaires. Ses graines sont imposees par
    /// l'interface de hook de transfert : Token-2022 la derive lui-meme pour
    /// la trouver, elle ne peut donc pas etre choisie ici.
    ///
    /// `UncheckedAccount` parce que sa disposition est un format TLV et non un
    /// compte Anchor : elle est ecrite par la bibliotheque d'interface.
    #[account(
        mut,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    /// CHECK: PDA de l'interface de hook, ecrit par ExtraAccountMetaList.
    pub extra_account_meta_list: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize(ctx: Context<Initialize>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.mint = ctx.accounts.mint.key();
    config.authority = ctx.accounts.authority.key();
    config.bump = ctx.bumps.config;

    // L'entree de liste, decrite par ses graines plutot que par son adresse.
    // La troisieme graine est lue dans les donnees du compte de destination :
    // c'est ce qui rend l'adresse verifiee non falsifiable par l'appelant.
    let metas = [ExtraAccountMeta::new_with_seeds(
        &[
            Seed::Literal {
                bytes: ALLOW_SEED.to_vec(),
            },
            Seed::AccountKey { index: MINT_INDEX },
            Seed::AccountData {
                account_index: DESTINATION_INDEX,
                data_index: OWNER_OFFSET,
                length: PUBKEY_LEN,
            },
        ],
        false, // ne signe pas
        false, // n'est pas modifie : le hook lit, il n'ecrit rien
    )
    .map_err(|_| error!(crate::error::HookError::ExtraAccountMetaInvalid))?];

    let taille = ExtraAccountMetaList::size_of(metas.len())
        .map_err(|_| error!(crate::error::HookError::ExtraAccountMetaInvalid))?;
    let loyer = Rent::get()?.minimum_balance(taille);

    // Le compte est cree ici plutot que par une contrainte `init` : sa taille
    // depend du nombre de metas, que seule la bibliotheque d'interface sait
    // calculer.
    let graines: &[&[u8]] = &[
        b"extra-account-metas",
        ctx.accounts.mint.to_account_info().key.as_ref(),
        &[ctx.bumps.extra_account_meta_list],
    ];
    anchor_lang::system_program::create_account(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.key(),
            anchor_lang::system_program::CreateAccount {
                from: ctx.accounts.payer.to_account_info(),
                to: ctx.accounts.extra_account_meta_list.to_account_info(),
            },
            &[graines],
        ),
        loyer,
        taille as u64,
        ctx.program_id,
    )?;

    let mut data = ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?;
    ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &metas)
        .map_err(|_| error!(crate::error::HookError::ExtraAccountMetaInvalid))?;

    Ok(())
}
