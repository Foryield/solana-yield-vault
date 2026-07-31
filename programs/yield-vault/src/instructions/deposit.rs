//! Depot : l'actif entre, les parts sortent.

use crate::{error::VaultError, math, state::*};
use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{
        mint_to, transfer_checked, Mint, MintTo, TokenAccount, TokenInterface, TransferChecked,
    },
};

/// Les comptes deserialises sont mis sur le TAS. Sans cela, la pile BPF de
/// 4 Ko par frame deborde des la deserialisation, sur un « Access violation in
/// stack frame » qui ne nomme pas sa cause. Dix comptes dont sept structures
/// suffisent a l'atteindre.
#[derive(Accounts)]
pub struct Deposit<'info> {
    pub depositor: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.deposit_mint.as_ref()],
        bump = vault.bump,
        has_one = deposit_mint,
        has_one = shares_mint,
    )]
    pub vault: Box<Account<'info, Vault>>,

    pub deposit_mint: Box<InterfaceAccount<'info, Mint>>,

    /// Muté : l'offre change a chaque emission de parts.
    #[account(mut, address = vault.shares_mint)]
    pub shares_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        seeds = [ASSETS_SEED, vault.key().as_ref()],
        bump,
    )]
    pub vault_assets: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [DEAD_SEED, vault.key().as_ref()],
        bump,
    )]
    pub dead_shares: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Compte d'actif du deposant. L'autorite est verifiee par le programme de
    /// jeton lors du transfert, pas ici.
    #[account(mut, token::mint = deposit_mint, token::token_program = deposit_token_program)]
    pub depositor_assets: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Compte de parts du deposant.
    #[account(mut, token::mint = shares_mint, token::token_program = shares_token_program)]
    pub depositor_shares: Box<InterfaceAccount<'info, TokenAccount>>,

    pub shares_token_program: Program<'info, Token2022>,
    pub deposit_token_program: Interface<'info, TokenInterface>,
}

pub fn handle_deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(!ctx.accounts.vault.paused, VaultError::Paused);

    // Etat lu AVANT tout appel externe. Aucune strategie n'etant branchee,
    // l'actif gere se reduit au solde oisif du coffre ; quand une strategie
    // arrivera, c'est ici que sa valorisation s'ajoutera.
    let assets_before = ctx.accounts.vault_assets.amount;
    let total_shares = ctx.accounts.shares_mint.supply;

    // Tout le calcul vit dans le module pur : le gestionnaire ne rejoue aucune
    // arithmetique, c'est ce qui rend le seuil de couverture defendable.
    let parts = math::shares_for_deposit(amount, total_shares, assets_before)
        .map_err(|e| error!(VaultError::from(e)))?;

    let deposit_mint_key = ctx.accounts.vault.deposit_mint;
    let graines: &[&[u8]] = &[
        VAULT_SEED,
        deposit_mint_key.as_ref(),
        &[ctx.accounts.vault.bump],
    ];
    let signataire = &[graines];

    // ORDRE : l'actif entre AVANT que les parts sortent. Aucune part n'existe
    // donc jamais sans contrepartie, meme le temps d'une transaction. L'ordre
    // inverse serait sans danger ici (Solana interdit la reentrance dans un
    // programme deja sur la pile d'appel, et la transaction est atomique), mais
    // celui-ci ne demande pas de le savoir pour etre juste.
    transfer_checked(
        CpiContext::new(
            ctx.accounts.deposit_token_program.key(),
            TransferChecked {
                from: ctx.accounts.depositor_assets.to_account_info(),
                mint: ctx.accounts.deposit_mint.to_account_info(),
                to: ctx.accounts.vault_assets.to_account_info(),
                authority: ctx.accounts.depositor.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.deposit_mint.decimals,
    )?;

    mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.shares_token_program.key(),
            MintTo {
                mint: ctx.accounts.shares_mint.to_account_info(),
                to: ctx.accounts.depositor_shares.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signataire,
        ),
        parts.to_depositor,
    )?;

    // Parts mortes : emises une seule fois, a la genese, vers un compte dont
    // aucune instruction du programme ne sort quoi que ce soit.
    if parts.dead > 0 {
        mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.shares_token_program.key(),
                MintTo {
                    mint: ctx.accounts.shares_mint.to_account_info(),
                    to: ctx.accounts.dead_shares.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signataire,
            ),
            parts.dead,
        )?;
    }

    Ok(())
}
