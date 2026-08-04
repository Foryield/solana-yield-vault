//! Erreurs du programme.
//!
//! Meme posture que le coffre : typees et stables, parce qu'un client hors
//! chaine teste un code et non une chaine de caracteres. Un code retire laisse
//! un trou plutot que d'etre reattribue.

use crate::venues::jupiter_lend::{lending::LectureError, math::VenueError};
use anchor_lang::prelude::*;

#[error_code]
pub enum AllocatorError {
    #[msg("Le compte de marche n'a pas la taille attendue")]
    MarcheTailleInattendue,
    #[msg("Le compte de marche porte un autre discriminateur")]
    MarcheDiscriminateurInattendu,
    #[msg("Le marche ne porte pas l'actif annonce")]
    MarcheActifEtranger,
    #[msg("Le marche ne porte pas le jeton de recu annonce")]
    MarcheJetonEtranger,
    #[msg("Le montant depose doit etre positif")]
    MontantNul,
    #[msg("Un prix d'echange du marche vaut zero")]
    PrixNul,
    #[msg("Debordement arithmetique")]
    Debordement,
    #[msg("La venue a emis moins de parts que la conversion n'en promettait")]
    PartsInsuffisantes,
    #[msg("La venue a rendu moins d'actif que le retrait n'en demandait")]
    ActifInsuffisant,
    #[msg("La venue a brule plus de parts que le plafond ne l'autorisait")]
    PartsBruleesExcessives,
    #[msg("La venue a preleve plus d'actif que le depot n'en offrait")]
    ActifPreleveExcessif,
    /// Employee par les QUATRE soustractions de solde du cablage, dont deux
    /// echouent quand un solde MONTE et deux quand il baisse. D'ou un libelle
    /// qui dit le sens attendu plutot qu'un sens particulier : un operateur qui
    /// lit ce code doit pouvoir se fier a ce qu'il annonce.
    #[msg("Le solde d'un compte de la position a varie dans le sens que l'operation interdit")]
    SoldeIncoherent,
}

/// Traduit une erreur d'arithmetique de venue. Correspondance totale et
/// explicite : pas de branche fourre-tout, pour qu'un ajout dans `VenueError`
/// ne se retrouve pas silencieusement traduit en autre chose.
impl From<VenueError> for AllocatorError {
    fn from(e: VenueError) -> Self {
        match e {
            VenueError::MontantNul => AllocatorError::MontantNul,
            VenueError::PrixNul => AllocatorError::PrixNul,
            VenueError::Debordement => AllocatorError::Debordement,
            VenueError::PartsInsuffisantes => AllocatorError::PartsInsuffisantes,
        }
    }
}

/// Meme regle pour la lecture du compte de marche.
impl From<LectureError> for AllocatorError {
    fn from(e: LectureError) -> Self {
        match e {
            LectureError::TailleInattendue => AllocatorError::MarcheTailleInattendue,
            LectureError::DiscriminateurInattendu => AllocatorError::MarcheDiscriminateurInattendu,
        }
    }
}
