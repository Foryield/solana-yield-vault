//! Les gestes d'administration : initialiser, ouvrir, regler, suspendre.
//!
//! REGROUPES DANS UN SEUL FICHIER parce qu'ils partagent une meme forme et une
//! meme garde, la signature de l'administrateur, et qu'aucun ne fait de travail
//! propre au-dela d'ecrire un champ. Les mouvements de fonds, eux, ont chacun
//! leur fichier : ce sont eux qui portent la complexite.
//!
//! L'IDENTITE DE L'ADMINISTRATEUR EST VERIFIEE PAR CONTRAINTE `has_one`, jamais
//! dans le corps d'un gestionnaire. Meme regle que le coupe-circuit du coffre :
//! une garde ecrite deux fois est une garde qui peut diverger.

use crate::{
    error::AllocatorError,
    state::*,
    venues::jupiter_lend::lending::{self},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Initialiser<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + Configuration::INIT_SPACE,
        seeds = [CONFIGURATION_SEED],
        bump,
    )]
    pub configuration: Account<'info, Configuration>,

    pub system_program: Program<'info, System>,
}

/// Fige l'administrateur de l'allocateur.
///
/// APPELABLE UNE SEULE FOIS, la contrainte `init` s'en chargeant : une seconde
/// tentative echoue parce que le compte existe. C'est ce qui empeche un tiers
/// de s'attribuer l'administration apres coup.
pub fn handle_initialiser(ctx: Context<Initialiser>) -> Result<()> {
    let c = &mut ctx.accounts.configuration;
    c.admin = ctx.accounts.admin.key();
    c.bump = ctx.bumps.configuration;
    Ok(())
}

#[derive(Accounts)]
pub struct OuvrirPosition<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(seeds = [CONFIGURATION_SEED], bump = configuration.bump, has_one = admin)]
    pub configuration: Account<'info, Configuration>,

    /// CHECK: graine seulement, jamais deserialise.
    pub coffre: UncheckedAccount<'info>,

    /// Compte de marche de la venue. Decode ICI pour en tirer l'actif et le
    /// jeton de recu, qui sont ensuite FIGES dans la position : les relire a
    /// chaque mouvement laisserait une chance de presenter un autre marche.
    /// CHECK: taille et discriminateur verifies par `lire_marche`.
    pub marche: UncheckedAccount<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + Position::INIT_SPACE,
        seeds = [POSITION_SEED, coffre.key().as_ref(), marche.key().as_ref()],
        bump,
    )]
    pub position: Account<'info, Position>,

    pub system_program: Program<'info, System>,
}

/// Ouvre une position sur un couple coffre et marche, avec son plafond.
///
/// L'ACTIF ET LE JETON DE RECU SONT LUS DANS LE MARCHE, pas fournis par
/// l'appelant. Un marche ne change pas d'actif ; les figer ici retire une
/// surface de validation a chaque mouvement, et rend impossible d'operer une
/// position avec un mint qui n'est pas le sien.
pub fn handle_ouvrir_position(ctx: Context<OuvrirPosition>, plafond: u64) -> Result<()> {
    let marche = {
        let donnees = ctx.accounts.marche.try_borrow_data()?;
        lending::lire_marche(&donnees).map_err(|e| error!(AllocatorError::from(e)))?
    };

    let p = &mut ctx.accounts.position;
    p.coffre = ctx.accounts.coffre.key();
    p.marche = ctx.accounts.marche.key();
    p.actif = Pubkey::new_from_array(marche.actif);
    p.jeton_de_recu = Pubkey::new_from_array(marche.jeton_de_recu);
    p.plafond = plafond;
    // OUVERTE NON SUSPENDUE. Ouvrir suspendu obligerait a deux gestes pour
    // commencer, et la position est de toute facon vide a cet instant.
    p.suspendue = false;
    p.bump = ctx.bumps.position;
    Ok(())
}

#[derive(Accounts)]
pub struct AdministrerPosition<'info> {
    pub admin: Signer<'info>,

    #[account(seeds = [CONFIGURATION_SEED], bump = configuration.bump, has_one = admin)]
    pub configuration: Account<'info, Configuration>,

    #[account(
        mut,
        seeds = [POSITION_SEED, position.coffre.as_ref(), position.marche.as_ref()],
        bump = position.bump,
    )]
    pub position: Account<'info, Position>,
}

/// Regle le plafond de protocole.
///
/// UN PLAFOND ABAISSE SOUS LA VALORISATION COURANTE EST ADMIS, et ce n'est pas
/// un oubli : c'est meme le geste qu'on veut pouvoir faire en premier quand une
/// venue inquiete. Il bloque tout nouveau depot sans rien forcer a sortir. Le
/// refuser obligerait a liquider avant de pouvoir se proteger.
pub fn handle_regler_plafond(ctx: Context<AdministrerPosition>, plafond: u64) -> Result<()> {
    ctx.accounts.position.plafond = plafond;
    Ok(())
}

/// Suspend ou reprend la position.
///
/// Suspendre bloque les DEPOTS seulement. Retraits et rachat integral restent
/// ouverts : une suspension qui fermerait aussi les sorties enfermerait les
/// fonds dans la venue au moment precis ou l'on veut pouvoir en sortir.
///
/// Basculer vers l'etat courant est admis plutot que refuse, meme raison que le
/// coffre : en situation d'incident on veut pouvoir suspendre sans avoir a lire
/// l'etat d'abord.
pub fn handle_suspendre(ctx: Context<AdministrerPosition>, suspendue: bool) -> Result<()> {
    ctx.accounts.position.suspendue = suspendue;
    Ok(())
}
