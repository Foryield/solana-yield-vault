//! Coupe-circuit administrateur.
//!
//! Le seul etat mutable du coffre. Suspendre bloque depots et retraits sans
//! rien deplacer : les fonds restent la ou ils sont, et les parts restent
//! transferables entre porteurs eligibles, le hook n'ayant pas connaissance de
//! la pause. C'est deliberé : une suspension protege le coffre d'une anomalie
//! sur ses propres flux, elle ne gele pas le marche secondaire des parts.

use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct SetPaused<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.deposit_mint.as_ref()],
        bump = vault.bump,
        has_one = admin,
    )]
    pub vault: Account<'info, Vault>,
}

pub fn handle_set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
    // L'identite de l'administrateur est verifiee par la contrainte `has_one`
    // sur le compte, pas ici : une garde ecrite deux fois est une garde qui
    // peut diverger.
    //
    // Basculer vers l'etat courant est admis plutot que refuse : c'est
    // idempotent, sans effet, et un refus obligerait tout appelant a lire
    // l'etat avant d'agir. En situation d'incident, on veut pouvoir suspendre
    // sans savoir si quelqu'un vient de le faire.
    ctx.accounts.vault.paused = paused;
    Ok(())
}
