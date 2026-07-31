//! Erreurs du programme.
//!
//! Typees et stables : un client hors chaine teste un code, pas une chaine de
//! caracteres. Les valeurs publiees ne changent jamais de sens ; un code retire
//! laisse un trou plutot que d'etre reattribue.

use crate::math::MathError;
use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Le coffre est suspendu")]
    Paused,
    #[msg("Le montant depose doit etre positif")]
    AmountMustBePositive,
    #[msg("Depot trop petit : il n'emettrait aucune part")]
    DepositTooSmall,
    #[msg("Le nombre de parts retirees doit etre positif")]
    SharesMustBePositive,
    #[msg("Retrait portant sur plus de parts qu'il n'en existe")]
    SharesExceedSupply,
    #[msg("Retrait trop petit : il ne rendrait aucune unite d'actif")]
    WithdrawTooSmall,
    #[msg("Des parts existent mais le coffre ne detient plus aucun actif")]
    VaultInsolvent,
    #[msg("Debordement arithmetique")]
    MathOverflow,
}

/// Traduit une erreur du module pur en erreur de programme. La correspondance
/// est totale et explicite : pas de branche fourre-tout, pour qu'un ajout dans
/// `MathError` ne se retrouve pas silencieusement traduit en autre chose.
impl From<MathError> for VaultError {
    fn from(e: MathError) -> Self {
        match e {
            MathError::AmountMustBePositive => VaultError::AmountMustBePositive,
            MathError::DepositTooSmall => VaultError::DepositTooSmall,
            MathError::SharesMustBePositive => VaultError::SharesMustBePositive,
            MathError::SharesExceedSupply => VaultError::SharesExceedSupply,
            MathError::WithdrawTooSmall => VaultError::WithdrawTooSmall,
            MathError::VaultInsolvent => VaultError::VaultInsolvent,
            MathError::MathOverflow => VaultError::MathOverflow,
        }
    }
}
