//! Etat du module de conformite.

use anchor_lang::prelude::*;

/// Graine de la configuration : une par mint gouverne.
pub const CONFIG_SEED: &[u8] = b"config";
/// Graine d'une entree de liste d'autorisation.
pub const ALLOW_SEED: &[u8] = b"allow";

/// Configuration du hook pour un mint donne.
///
/// Le hook ne connait PAS le coffre : il gouverne un mint, quel qu'il soit.
/// C'est ce qui permet a un protocole sans lien avec ce projet de le forker
/// seul.
#[account]
#[derive(InitSpace)]
pub struct HookConfig {
    /// Mint gouverne. Immuable.
    pub mint: Pubkey,
    /// Seule habilitee a autoriser et revoquer. Distincte de l'administrateur
    /// du coffre : mettre a jour une eligibilite et suspendre un coffre sont
    /// deux gestes de nature differente, exerces par des personnes
    /// differentes.
    pub authority: Pubkey,
    pub bump: u8,
}

/// Entree de liste d'autorisation.
///
/// L'EXISTENCE du compte vaut autorisation ; son contenu n'est la que pour
/// l'auditabilite. Revoquer, c'est fermer le compte, ce qui rend son depot a
/// l'autorite et ne laisse aucun etat residuel a interpreter.
#[account]
#[derive(InitSpace)]
pub struct AllowlistEntry {
    /// Porteur autorise a RECEVOIR des parts de ce mint.
    pub holder: Pubkey,
    pub bump: u8,
}
