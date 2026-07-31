//! Retrait : les parts sont detruites, l'actif sort.

use crate::{error::VaultError, math, state::*};
use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{
        burn, transfer_checked, Burn, Mint, TokenAccount, TokenInterface, TransferChecked,
    },
};

/// Comptes sur le TAS d'emblee : la pile BPF de 4 Ko par frame deborde des la
/// deserialisation au-dela de quelques structures, sur une « Access violation
/// in stack frame » qui ne nomme pas sa cause (piege rencontre a la tache 3).
#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub holder: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.deposit_mint.as_ref()],
        bump = vault.bump,
        has_one = deposit_mint,
        has_one = shares_mint,
    )]
    pub vault: Box<Account<'info, Vault>>,

    pub deposit_mint: Box<InterfaceAccount<'info, Mint>>,

    /// Mute : l'offre baisse a chaque destruction de parts.
    #[account(mut, address = vault.shares_mint)]
    pub shares_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(mut, seeds = [ASSETS_SEED, vault.key().as_ref()], bump)]
    pub vault_assets: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, token::mint = deposit_mint, token::token_program = deposit_token_program)]
    pub holder_assets: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, token::mint = shares_mint, token::token_program = shares_token_program)]
    pub holder_shares: Box<InterfaceAccount<'info, TokenAccount>>,

    pub shares_token_program: Program<'info, Token2022>,
    pub deposit_token_program: Interface<'info, TokenInterface>,
}

pub fn handle_withdraw(ctx: Context<Withdraw>, shares: u64) -> Result<()> {
    require!(!ctx.accounts.vault.paused, VaultError::Paused);

    // Etat lu AVANT toute destruction, comme sur la version Soroban : le
    // pro-rata se calcule sur l'etat d'avant, sans quoi le dernier sortant
    // emporterait davantage que sa part.
    let assets = ctx.accounts.vault_assets.amount;
    let total_shares = ctx.accounts.shares_mint.supply;

    let amount = math::assets_for_withdraw(shares, total_shares, assets)
        .map_err(|e| error!(VaultError::from(e)))?;

    // Les parts sont detruites AVANT que l'actif sorte, symetrique du depot :
    // a aucun instant le porteur ne detient a la fois ses parts et leur
    // contrepartie. La destruction exige l'autorite du porteur, donc elle
    // echoue d'elle-meme s'il ne detient pas les parts qu'il pretend rendre.
    burn(
        CpiContext::new(
            ctx.accounts.shares_token_program.key(),
            Burn {
                mint: ctx.accounts.shares_mint.to_account_info(),
                from: ctx.accounts.holder_shares.to_account_info(),
                authority: ctx.accounts.holder.to_account_info(),
            },
        ),
        shares,
    )?;

    let deposit_mint_key = ctx.accounts.vault.deposit_mint;
    let graines: &[&[u8]] = &[
        VAULT_SEED,
        deposit_mint_key.as_ref(),
        &[ctx.accounts.vault.bump],
    ];

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.deposit_token_program.key(),
            TransferChecked {
                from: ctx.accounts.vault_assets.to_account_info(),
                mint: ctx.accounts.deposit_mint.to_account_info(),
                to: ctx.accounts.holder_assets.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            &[graines],
        ),
        amount,
        ctx.accounts.deposit_mint.decimals,
    )?;

    Ok(())
}
