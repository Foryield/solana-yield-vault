//! Coffre de rendement (ossature).
//!
//! ETAT : ossature d'amorcage. Aucune instruction n'est implementee, et c'est
//! deliberé : la regle du depot interdit d'ecrire du programme avant que les
//! trois spikes bloquants aient rendu leur verdict, et S1 (ce qui declenche
//! reellement le hook de transfert Token-2022) est encore ouvert. Son issue
//! peut changer la forme des parts, donc celle du coffre.
//!
//! Ce que ce fichier sert aujourd'hui : figer l'identifiant de programme et
//! prouver la chaine complete, de la compilation au deploiement devnet.
//!
//! Conception : `docs/plans/2026-07-31-solana-yield-vault-design.md`.
//!
//! DECOUPAGE IMPOSE PAR S2, a respecter des la premiere instruction :
//! l'arithmetique (parts, valorisation, arrondis, gardes) vit dans des
//! fonctions PURES sous un module dedie, testees cote hote ; les gestionnaires
//! d'instruction se reduisent a du cablage. Un instrument de couverture ne voit
//! rien du chemin BPF qu'emprunte LiteSVM : sans ce decoupage, aucun seuil de
//! couverture n'a de sens. Mesure a l'appui dans le verdict S2.

pub mod error;
pub mod instructions;
pub mod math;
pub mod state;

use anchor_lang::prelude::*;

pub use error::*;
pub use instructions::*;
pub use state::*;

declare_id!("2bkjZG8njXHQ1tdj5aRSiwjjndX1qEvjFYzBYJQjNysw");

#[program]
pub mod yield_vault {
    use super::*;

    /// Cree le coffre, le mint des parts et les comptes de detention.
    /// `hook_program` est fige ici : il ne changera plus.
    pub fn initialize(ctx: Context<Initialize>, hook_program: Pubkey) -> Result<()> {
        instructions::initialize::handle_initialize(ctx, hook_program)
    }

    /// Depose `amount` d'actif et emet les parts correspondantes.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit::handle_deposit(ctx, amount)
    }

    /// Detruit `shares` parts et restitue l'actif au pro-rata.
    pub fn withdraw(ctx: Context<Withdraw>, shares: u64) -> Result<()> {
        instructions::withdraw::handle_withdraw(ctx, shares)
    }

    /// Suspend ou reprend depots et retraits. Administrateur uniquement.
    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        instructions::pause::handle_set_paused(ctx, paused)
    }
}
