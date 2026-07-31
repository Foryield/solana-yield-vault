//! Gestion de la liste d'autorisation.
//!
//! L'EXISTENCE du compte vaut autorisation. Revoquer, c'est fermer le compte :
//! son depot revient a l'autorite et il ne reste aucun etat residuel a
//! interpreter. Un drapeau `active` dans un compte conserve aurait laisse deux
//! facons d'etre non autorise, donc deux facons de se tromper.

use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(holder: Pubkey)]
pub struct Allow<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        has_one = authority,
    )]
    pub config: Box<Account<'info, HookConfig>>,

    pub authority: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + AllowlistEntry::INIT_SPACE,
        seeds = [ALLOW_SEED, config.mint.as_ref(), holder.as_ref()],
        bump,
    )]
    pub entry: Box<Account<'info, AllowlistEntry>>,

    pub system_program: Program<'info, System>,
}

pub fn handle_allow(ctx: Context<Allow>, holder: Pubkey) -> Result<()> {
    let entry = &mut ctx.accounts.entry;
    entry.holder = holder;
    entry.bump = ctx.bumps.entry;
    Ok(())
}

#[derive(Accounts)]
#[instruction(holder: Pubkey)]
pub struct Revoke<'info> {
    #[account(
        seeds = [CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
        has_one = authority,
    )]
    pub config: Box<Account<'info, HookConfig>>,

    /// Modifiable : c'est elle qui recoit le depot du compte ferme. Sans
    /// `mut`, le runtime refuse la transaction sur « instruction changed the
    /// balance of a read-only account », un message qui ne nomme pas le compte
    /// fautif.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Le depot revient a l'autorite, pas au payeur d'origine : c'est
    /// l'autorite qui porte la responsabilite de la liste dans la duree.
    #[account(
        mut,
        close = authority,
        seeds = [ALLOW_SEED, config.mint.as_ref(), holder.as_ref()],
        bump = entry.bump,
    )]
    pub entry: Box<Account<'info, AllowlistEntry>>,
}

pub fn handle_revoke(_ctx: Context<Revoke>, _holder: Pubkey) -> Result<()> {
    Ok(())
}
