//! Initialisation du coffre : cree l'etat, le mint des parts, le compte qui
//! detient l'actif et celui qui detiendra les parts mortes.

use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

#[derive(Accounts)]
#[instruction(hook_program: Pubkey)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// Actif depose. Son programme de jeton est laisse ouvert : USDC et EURC
    /// devnet sont detenus par le programme SPL CLASSIQUE, pas par Token-2022.
    pub deposit_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = admin,
        space = 8 + Vault::INIT_SPACE,
        seeds = [VAULT_SEED, deposit_mint.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, Vault>,

    /// Mint des parts, cree ICI plutot que fourni de l'exterieur : un mint
    /// fourni exigerait de valider son extension, son autorite et ses
    /// decimales, et toute validation oubliee serait une faille. Le creer
    /// supprime la surface.
    ///
    /// Autorite du hook mise a `None` : le programme de hook est immuable, donc
    /// personne ne doit pouvoir le changer apres coup, pas meme l'admin.
    #[account(
        init,
        payer = admin,
        seeds = [SHARES_SEED, vault.key().as_ref()],
        bump,
        mint::decimals = deposit_mint.decimals,
        mint::authority = vault,
        mint::token_program = shares_token_program,
        extensions::transfer_hook::authority = vault,
        extensions::transfer_hook::program_id = hook_program,
    )]
    pub shares_mint: InterfaceAccount<'info, Mint>,

    /// Detient l'actif depose. Autorite : le PDA du coffre.
    #[account(
        init,
        payer = admin,
        seeds = [ASSETS_SEED, vault.key().as_ref()],
        bump,
        token::mint = deposit_mint,
        token::authority = vault,
        token::token_program = deposit_token_program,
    )]
    pub vault_assets: InterfaceAccount<'info, TokenAccount>,

    /// Recoit les parts mortes au premier depot. Aucune instruction du
    /// programme n'en sort quoi que ce soit : le verrouillage tient a
    /// l'absence de chemin, pas a une garde qu'on pourrait contourner.
    #[account(
        init,
        payer = admin,
        seeds = [DEAD_SEED, vault.key().as_ref()],
        bump,
        token::mint = shares_mint,
        token::authority = vault,
        token::token_program = shares_token_program,
    )]
    pub dead_shares: InterfaceAccount<'info, TokenAccount>,

    /// Token-2022 impose pour les parts : l'extension de hook n'existe pas
    /// ailleurs.
    pub shares_token_program: Program<'info, Token2022>,
    /// Programme de jeton de l'actif depose, classique ou Token-2022.
    pub deposit_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize(ctx: Context<Initialize>, hook_program: Pubkey) -> Result<()> {
    // Les comptes sont deja crees par les contraintes `init` : mint des parts
    // avec son extension, compte d'actif, compte mort. Il ne reste ici que
    // l'etat, ce qui est exactement la reduction au cablage que le decoupage
    // impose.
    let vault = &mut ctx.accounts.vault;
    vault.admin = ctx.accounts.admin.key();
    vault.deposit_mint = ctx.accounts.deposit_mint.key();
    vault.shares_mint = ctx.accounts.shares_mint.key();
    vault.hook_program = hook_program;
    vault.paused = false;
    vault.bump = ctx.bumps.vault;
    Ok(())
}
