//! Erreurs du module de conformite.

use anchor_lang::prelude::*;

#[error_code]
pub enum HookError {
    #[msg("Liste de comptes supplementaires invalide")]
    ExtraAccountMetaInvalid,
    #[msg("Le destinataire n'est pas sur la liste d'autorisation")]
    NotAllowed,
    #[msg("Cette instruction n'est appelable que par Token-2022, pendant un transfert")]
    NotATransfer,
}
