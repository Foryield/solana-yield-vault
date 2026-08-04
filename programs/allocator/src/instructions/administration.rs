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
use anchor_spl::token_interface::TokenAccount;

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
pub fn handle_ouvrir_position(
    ctx: Context<OuvrirPosition>,
    plafond: u64,
    tolerance_bps: u16,
) -> Result<()> {
    require!(
        tolerance_bps <= TOLERANCE_MAXIMALE_BPS,
        AllocatorError::ToleranceAberrante
    );
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
    p.tolerance_bps = tolerance_bps;
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

/// Regle la tolerance des bornes de sortie.
///
/// BORNEE PAR LE PROGRAMME, et pas seulement par le jugement de
/// l'administrateur : une tolerance de cent pour cent reviendrait a n'avoir
/// aucune borne, ce qui n'est pas une option de reglage mais une desactivation
/// silencieuse. Le plafond est bas volontairement ; une derive d'arrondi se
/// compte en unites, jamais en pourcents.
pub fn handle_regler_tolerance(
    ctx: Context<AdministrerPosition>,
    tolerance_bps: u16,
) -> Result<()> {
    require!(
        tolerance_bps <= TOLERANCE_MAXIMALE_BPS,
        AllocatorError::ToleranceAberrante
    );
    ctx.accounts.position.tolerance_bps = tolerance_bps;
    Ok(())
}

#[derive(Accounts)]
pub struct FermerPosition<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(seeds = [CONFIGURATION_SEED], bump = configuration.bump, has_one = admin)]
    pub configuration: Account<'info, Configuration>,

    /// CHECK: graine seulement, jamais deserialise.
    pub coffre: UncheckedAccount<'info>,
    /// CHECK: graine seulement, jamais deserialise.
    pub marche: UncheckedAccount<'info>,

    /// LA POSITION N'EST PAS DESERIALISEE ICI, et c'est tout l'objet de ce
    /// geste. Une position ecrite par une version anterieure du programme ne se
    /// relit pas par la suivante des lors que sa disposition a change : la lire
    /// pour la fermer rendrait la fermeture impossible exactement dans le cas ou
    /// elle sert. Les graines suffisent a garantir qu'il s'agit bien d'elle.
    /// CHECK: adresse entierement contrainte par ses graines ; contenu
    /// volontairement ignore.
    #[account(
        mut,
        seeds = [POSITION_SEED, coffre.key().as_ref(), marche.key().as_ref()],
        bump,
    )]
    pub position: UncheckedAccount<'info>,

    /// Jetons de recu de la position. LU POUR EXIGER QU'ELLE SOIT SORTIE :
    /// fermer la gouvernance d'une position qui detient encore une exposition la
    /// rendrait orpheline, gerable par personne.
    #[account(token::authority = position)]
    pub recu_de_la_position: Box<InterfaceAccount<'info, TokenAccount>>,
}

/// Ferme une position sortie et rend son depot de non-expiration.
///
/// EXIGE QUE LA POSITION SOIT SORTIE DE LA VENUE. Le compte de jeton, lui,
/// survit : il appartient a l'adresse derivee, qui se rederive a l'identique si
/// la position est rouverte un jour. Fermer ne perd donc rien d'autre que des
/// reglages.
///
/// CHEMIN DE MIGRATION AUTANT QUE DE CYCLE DE VIE. Ajouter un champ a une
/// position change sa taille, et un compte deja alloue ne grandit pas tout seul.
/// Fermer puis rouvrir est le chemin le plus court, et il est sans risque des
/// lors que la position est vide.
pub fn handle_fermer_position(ctx: Context<FermerPosition>) -> Result<()> {
    require!(
        ctx.accounts.recu_de_la_position.amount == 0,
        AllocatorError::PositionNonSortie
    );

    let position = ctx.accounts.position.to_account_info();
    // Une adresse derivee qui ne nous appartient pas n'a rien a fermer : soit
    // elle n'a jamais ete ouverte, soit elle n'est pas a nous. Dans les deux cas
    // le refus vaut mieux qu'un geste silencieux.
    require_keys_eq!(*position.owner, crate::ID, AllocatorError::PositionVide);

    // Fermeture a la main plutot que par la contrainte `close`, qui exige de
    // deserialiser. Les trois gestes sont ceux que fait Anchor : rendre les
    // lamports, vider les donnees, rendre le compte au programme systeme.
    let admin = ctx.accounts.admin.to_account_info();
    let solde = position.lamports();
    **position.try_borrow_mut_lamports()? -= solde;
    **admin.try_borrow_mut_lamports()? += solde;
    // Le discriminateur est ecrase avant de rendre le compte : un compte vide
    // mais portant encore sa signature de type se relirait comme une position.
    position.try_borrow_mut_data()?.fill(0);
    position.assign(&anchor_lang::system_program::ID);

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
