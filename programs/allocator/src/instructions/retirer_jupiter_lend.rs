//! Retrait de Jupiter Lend : les jetons de recu brulent, l'actif revient.
//!
//! LE PLAFOND VIENT DE L'APPELANT, la ou le plancher du depot est calcule sur
//! la chaine, et l'asymetrie est assumee. La conversion du depot a ete MESUREE
//! contre les prix reels du marche devnet le 02/08 ; celle du retrait ne l'a
//! pas ete, et rien de ce que l'editeur publie ne la donne. La deduire ici
//! reviendrait a inventer une borne, exactement le geste que le plan reproche
//! a la formule simplifiee : trop serree, elle ferait echouer tous les
//! retraits. L'appelant la calcule donc a partir de ce qu'il observe, et
//! l'etape 2 la reprendra sur la chaine le jour ou elle aura ete mesuree.
//!
//! CE CHOIX NE DESARME PAS LA CEINTURE. Le controle qui protege reellement ne
//! depend d'aucune arithmetique : l'actif recu doit atteindre le montant
//! demande, et les parts brulees ne doivent pas depasser le plafond. Les deux
//! se lisent sur des soldes, avant et apres.

use crate::{
    error::AllocatorError,
    state::POSITION_SEED,
    venues::jupiter_lend::{cpi, lending},
};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::{invoke, invoke_signed};
use anchor_spl::token_interface::TokenAccount;

/// Vingt et un comptes, dont dix-huit sont ceux de la venue. Le compte
/// supplementaire par rapport au depot est celui de reclamation.
#[derive(Accounts)]
pub struct RetirerJupiterLend<'info> {
    pub operateur: Signer<'info>,

    /// CHECK: graine seulement, jamais deserialise.
    pub coffre: UncheckedAccount<'info>,

    /// CHECK: taille et discriminateur verifies par `lire_marche`.
    #[account(mut)]
    pub marche: UncheckedAccount<'info>,

    /// CHECK: aucune donnee lue ; l'adresse est entierement contrainte par ses
    /// graines.
    #[account(seeds = [POSITION_SEED, coffre.key().as_ref(), marche.key().as_ref()], bump)]
    pub position: UncheckedAccount<'info>,

    /// Actif detenu par la position, destination du retrait.
    #[account(mut, token::authority = position, token::mint = actif)]
    pub actif_de_la_position: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Jetons de recu detenus par la position, source du retrait.
    #[account(mut, token::authority = position, token::mint = jeton_de_recu)]
    pub recu_de_la_position: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: mint de l'actif ; confronte a celui que le marche declare.
    pub actif: UncheckedAccount<'info>,
    /// CHECK: mint du jeton de recu ; confronte a celui que le marche declare.
    #[account(mut)]
    pub jeton_de_recu: UncheckedAccount<'info>,
    /// CHECK: compte d'administration de la venue, transmis tel quel.
    pub administration: UncheckedAccount<'info>,
    /// CHECK: reserves de liquidite de la venue, transmises telles quelles.
    #[account(mut)]
    pub reserves_de_liquidite: UncheckedAccount<'info>,
    /// CHECK: position de fourniture sur la couche de liquidite.
    #[account(mut)]
    pub position_de_liquidite: UncheckedAccount<'info>,
    /// CHECK: modele de taux de la venue, transmis tel quel.
    pub modele_de_taux: UncheckedAccount<'info>,
    /// CHECK: coffre de la venue, a ne pas confondre avec le notre.
    #[account(mut)]
    pub coffre_de_la_venue: UncheckedAccount<'info>,
    /// COMPTE DE RECLAMATION, propre au retrait. Adresse derivee du programme
    /// de recompenses que rien ne cree automatiquement : elle doit exister
    /// AVANT le premier retrait. C'est un prealable d'exploitation.
    /// CHECK: transmis tel quel a la venue, qui le valide.
    #[account(mut)]
    pub compte_de_reclamation: UncheckedAccount<'info>,
    /// CHECK: couche de liquidite de la venue.
    #[account(mut)]
    pub liquidite: UncheckedAccount<'info>,
    /// CHECK: programme de liquidite de la venue.
    #[account(mut)]
    pub programme_de_liquidite: UncheckedAccount<'info>,
    /// CHECK: modele de taux de recompenses de la venue.
    pub modele_de_recompenses: UncheckedAccount<'info>,

    /// CHECK: programme de pret de la venue, cible des deux invocations.
    pub programme_de_pret: UncheckedAccount<'info>,
    /// CHECK: programme de jeton attendu par la venue.
    pub programme_de_jeton: UncheckedAccount<'info>,
    /// CHECK: programme de compte associe attendu par la venue.
    pub programme_de_compte_associe: UncheckedAccount<'info>,
    /// CHECK: programme systeme attendu par la venue.
    pub programme_systeme: UncheckedAccount<'info>,
}

pub fn handle_retirer_jupiter_lend(
    ctx: Context<RetirerJupiterLend>,
    actif: u64,
    parts_maximales: u64,
) -> Result<()> {
    let venue = ctx.accounts.programme_de_pret.key();

    // Meme contrainte de fraicheur qu'au depot, et pour la meme raison : un
    // retrait valorise sur des prix perimes brule le mauvais nombre de parts.
    let rafraichir = cpi::instruction_rafraichir(
        venue,
        &cpi::ComptesRafraichir {
            marche: ctx.accounts.marche.key(),
            actif: ctx.accounts.actif.key(),
            jeton_de_recu: ctx.accounts.jeton_de_recu.key(),
            reserves_de_liquidite: ctx.accounts.reserves_de_liquidite.key(),
            modele_de_recompenses: ctx.accounts.modele_de_recompenses.key(),
        },
    );
    invoke(
        &rafraichir,
        &[
            ctx.accounts.marche.to_account_info(),
            ctx.accounts.actif.to_account_info(),
            ctx.accounts.jeton_de_recu.to_account_info(),
            ctx.accounts.reserves_de_liquidite.to_account_info(),
            ctx.accounts.modele_de_recompenses.to_account_info(),
            ctx.accounts.programme_de_pret.to_account_info(),
        ],
    )?;

    let marche = {
        let donnees = ctx.accounts.marche.try_borrow_data()?;
        lending::lire_marche(&donnees).map_err(|e| error!(AllocatorError::from(e)))?
    };
    require!(
        marche.actif == ctx.accounts.actif.key().to_bytes(),
        AllocatorError::MarcheActifEtranger
    );
    require!(
        marche.jeton_de_recu == ctx.accounts.jeton_de_recu.key().to_bytes(),
        AllocatorError::MarcheJetonEtranger
    );

    let actif_avant = ctx.accounts.actif_de_la_position.amount;
    let recu_avant = ctx.accounts.recu_de_la_position.amount;

    let retrait = cpi::instruction_retrait(
        venue,
        &cpi::ComptesRetrait {
            signataire: ctx.accounts.position.key(),
            recu_du_proprietaire: ctx.accounts.recu_de_la_position.key(),
            actif_du_destinataire: ctx.accounts.actif_de_la_position.key(),
            administration: ctx.accounts.administration.key(),
            marche: ctx.accounts.marche.key(),
            actif: ctx.accounts.actif.key(),
            jeton_de_recu: ctx.accounts.jeton_de_recu.key(),
            reserves_de_liquidite: ctx.accounts.reserves_de_liquidite.key(),
            position_de_liquidite: ctx.accounts.position_de_liquidite.key(),
            modele_de_taux: ctx.accounts.modele_de_taux.key(),
            coffre_de_la_venue: ctx.accounts.coffre_de_la_venue.key(),
            compte_de_reclamation: ctx.accounts.compte_de_reclamation.key(),
            liquidite: ctx.accounts.liquidite.key(),
            programme_de_liquidite: ctx.accounts.programme_de_liquidite.key(),
            modele_de_recompenses: ctx.accounts.modele_de_recompenses.key(),
            programme_de_jeton: ctx.accounts.programme_de_jeton.key(),
            programme_de_compte_associe: ctx.accounts.programme_de_compte_associe.key(),
            programme_systeme: ctx.accounts.programme_systeme.key(),
        },
        actif,
        parts_maximales,
    );

    let coffre = ctx.accounts.coffre.key();
    let marche_cle = ctx.accounts.marche.key();
    let graines: &[&[u8]] = &[
        POSITION_SEED,
        coffre.as_ref(),
        marche_cle.as_ref(),
        &[ctx.bumps.position],
    ];

    invoke_signed(
        &retrait,
        &[
            ctx.accounts.position.to_account_info(),
            ctx.accounts.recu_de_la_position.to_account_info(),
            ctx.accounts.actif_de_la_position.to_account_info(),
            ctx.accounts.administration.to_account_info(),
            ctx.accounts.marche.to_account_info(),
            ctx.accounts.actif.to_account_info(),
            ctx.accounts.jeton_de_recu.to_account_info(),
            ctx.accounts.reserves_de_liquidite.to_account_info(),
            ctx.accounts.position_de_liquidite.to_account_info(),
            ctx.accounts.modele_de_taux.to_account_info(),
            ctx.accounts.coffre_de_la_venue.to_account_info(),
            ctx.accounts.compte_de_reclamation.to_account_info(),
            ctx.accounts.liquidite.to_account_info(),
            ctx.accounts.programme_de_liquidite.to_account_info(),
            ctx.accounts.modele_de_recompenses.to_account_info(),
            ctx.accounts.programme_de_jeton.to_account_info(),
            ctx.accounts.programme_de_compte_associe.to_account_info(),
            ctx.accounts.programme_systeme.to_account_info(),
            ctx.accounts.programme_de_pret.to_account_info(),
        ],
        &[graines],
    )?;

    ctx.accounts.actif_de_la_position.reload()?;
    ctx.accounts.recu_de_la_position.reload()?;

    // L'ACTIF DEMANDE DOIT ETRE ARRIVE. Ce controle ne doit rien a personne :
    // il compare un solde a un montant que nous avons nous-memes demande.
    let recu = ctx
        .accounts
        .actif_de_la_position
        .amount
        .checked_sub(actif_avant)
        .ok_or(AllocatorError::SoldeIncoherent)?;
    require!(recu >= actif, AllocatorError::ActifInsuffisant);

    // ET LE PRIX PAYE NE DOIT PAS DEPASSER LE PLAFOND. La venue s'y engage deja
    // par sa propre borne ; nous le constatons quand meme.
    let brulees = recu_avant
        .checked_sub(ctx.accounts.recu_de_la_position.amount)
        .ok_or(AllocatorError::SoldeIncoherent)?;
    require!(
        brulees <= parts_maximales,
        AllocatorError::PartsBruleesExcessives
    );

    msg!(
        "retrait de {} unites contre {} parts brulees",
        recu,
        brulees
    );

    Ok(())
}
