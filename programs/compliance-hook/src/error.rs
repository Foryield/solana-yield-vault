//! Erreurs du module de conformite.

use anchor_lang::prelude::*;

#[error_code]
pub enum HookError {
    #[msg("Liste de comptes supplementaires invalide")]
    ExtraAccountMetaInvalid,
}
