//! Hook de transfert Token-2022 : liste d'autorisation des porteurs.
//!
//! Le mint des parts d'un coffre porte l'extension de hook de transfert
//! pointant vers ce programme. Token-2022 l'invoque a CHAQUE transfert, et le
//! verdict S1 a etabli qu'aucune voie de mouvement n'y echappe : le transfert
//! herite est rejete plutot que contourne, l'extension de compte ne peut pas
//! etre esquivee, et les transferts confidentiels empruntent le meme motif.
//!
//! Ce programme decide donc ce que Token-2022 fera. Il verifie le
//! DESTINATAIRE : un porteur eligible doit pouvoir sortir vers un tiers
//! eligible, ce qu'on interdit c'est qu'une part atterrisse chez quelqu'un qui
//! n'a pas franchi les controles d'entree.
//!
//! Une frappe n'etant pas un transfert, l'emission de parts par le coffre n'est
//! pas concernee : le controle d'eligibilite a lieu a l'entree du produit, hors
//! chaine.
//!
//! Plan : `docs/plans/2026-07-31-hook-conformite-plan.md`.

pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;
use spl_discriminator::SplDiscriminate;

pub use error::*;
pub use instructions::*;
pub use state::*;

declare_id!("EGbJBdCUK5ecUiVJ9FFiGdVEZQ15cE31zNm97RUpFK63");

#[program]
pub mod compliance_hook {
    use super::*;

    /// Attache le hook a un mint : cree sa configuration et la liste de
    /// comptes supplementaires que Token-2022 lira a chaque transfert.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize::handle_initialize(ctx)
    }

    /// Autorise `holder` a RECEVOIR des parts du mint gouverne.
    pub fn allow(ctx: Context<Allow>, holder: Pubkey) -> Result<()> {
        instructions::allowlist::handle_allow(ctx, holder)
    }

    /// Retire l'autorisation de `holder`. Le compte est ferme, il ne reste
    /// aucun etat residuel.
    pub fn revoke(ctx: Context<Revoke>, holder: Pubkey) -> Result<()> {
        instructions::allowlist::handle_revoke(ctx, holder)
    }

    /// Appelee par Token-2022 a chaque transfert. Le discriminant est celui de
    /// l'interface de hook, pas celui d'Anchor : c'est Token-2022 qui compose
    /// l'appel, il ne connait que l'interface.
    #[instruction(discriminator = spl_transfer_hook_interface::instruction::ExecuteInstruction::SPL_DISCRIMINATOR_SLICE)]
    pub fn transfer_hook(ctx: Context<Execute>, amount: u64) -> Result<()> {
        instructions::execute::handle_execute(ctx, amount)
    }
}
