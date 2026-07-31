//! Etat persistant du coffre.

use anchor_lang::prelude::*;

/// Graine du compte de coffre. Un coffre par actif depose : l'identite du
/// coffre se derive de son actif, ce qui rend son adresse calculable hors chaine
/// sans registre.
pub const VAULT_SEED: &[u8] = b"vault";
/// Graine du mint des parts.
pub const SHARES_SEED: &[u8] = b"shares";
/// Graine du compte de jeton qui detient l'actif depose.
pub const ASSETS_SEED: &[u8] = b"assets";
/// Graine du compte qui detient les parts mortes, sans chemin de rachat.
pub const DEAD_SEED: &[u8] = b"dead";

/// Coffre. Tout y est immuable apres l'initialisation sauf l'etat de pause :
/// changer d'actif, de mint de parts ou de programme de hook exige un
/// redeploiement, meme convention que le pool fixe a l'initialisation sur la
/// version Soroban.
///
/// Ce que ce compte ne porte PAS, deliberement : ni total des parts, ni solde.
/// Les parts sont un mint Token-2022, donc leur comptabilite appartient au
/// programme de jeton ; dupliquer un total ici creerait une seconde verite,
/// donc une divergence possible.
#[account]
#[derive(InitSpace)]
pub struct Vault {
    /// Seul habilite a suspendre et lever la suspension.
    pub admin: Pubkey,
    /// Mint de l'actif depose. Jeton SPL classique en pratique (USDC, EURC).
    pub deposit_mint: Pubkey,
    /// Mint des parts, Token-2022 portant l'extension de hook de transfert.
    pub shares_mint: Pubkey,
    /// Programme de hook impose aux transferts de parts. Immuable.
    pub hook_program: Pubkey,
    /// Coupe-circuit : depots et retraits rejetes tant qu'il est leve.
    pub paused: bool,
    pub bump: u8,
}
