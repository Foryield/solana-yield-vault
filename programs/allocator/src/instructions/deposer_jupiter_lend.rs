//! Depot sur Jupiter Lend : l'actif de la position part, les jetons de recu
//! reviennent.
//!
//! CEINTURE ET BRETELLES, et c'est une decision explicite. La borne voyage dans
//! la charge utile de `depositWithMinAmountOut`, donc le programme qui emet
//! reellement les jetons la fait respecter ; et l'allocateur mesure quand meme
//! les deux soldes avant et apres. La premiere protection suffirait si leur
//! garde etait sans defaut ; la seconde ne suppose rien de leur code et ne
//! reclame aucune arithmetique supplementaire, puisqu'elle ne fait que
//! soustraire deux soldes que nous lisons nous-memes.

use crate::{
    error::AllocatorError,
    state::POSITION_SEED,
    venues::jupiter_lend::{cpi, lending, math},
};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::{invoke, invoke_signed};
use anchor_spl::token_interface::TokenAccount;

/// Vingt comptes, dont dix-sept sont ceux de la venue.
///
/// L'ORDRE DE CETTE STRUCTURE N'EST PAS CELUI DE LA VENUE et n'a pas a l'etre :
/// c'est `cpi::instruction_depot` qui range les comptes au rang de l'IDL. Ici
/// l'ordre suit la lecture, du plus proche de nous au plus lointain.
#[derive(Accounts)]
pub struct DeposerJupiterLend<'info> {
    /// Declencheur. L'etape 1 ne lui demande que de signer la transaction ;
    /// l'etape 2 attachera une autorite verifiee a la position.
    pub operateur: Signer<'info>,

    /// Coffre servi. Employe UNIQUEMENT comme graine de la position : aucune
    /// donnee n'en est lue, ce qui evite de lier l'allocateur a la disposition
    /// du compte de coffre.
    /// CHECK: graine seulement, jamais deserialise.
    pub coffre: UncheckedAccount<'info>,

    /// Compte de marche de la venue, decode par `lire_marche` APRES le
    /// rafraichissement des prix.
    /// CHECK: taille et discriminateur verifies par `lire_marche`.
    #[account(mut)]
    pub marche: UncheckedAccount<'info>,

    /// Autorite de signature de la position, une par couple coffre et marche.
    /// Sans donnees a l'etape 1 : elle signe et detient, elle ne raconte rien.
    /// CHECK: aucune donnee lue ; l'adresse est entierement contrainte par ses
    /// graines, donc un compte etranger ne peut pas se presenter ici.
    #[account(seeds = [POSITION_SEED, coffre.key().as_ref(), marche.key().as_ref()], bump)]
    pub position: UncheckedAccount<'info>,

    /// Actif detenu par la position, source du depot.
    #[account(mut, token::authority = position, token::mint = actif)]
    pub actif_de_la_position: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Jetons de recu detenus par la position, destination du depot. C'est le
    /// solde de CE compte qui mesure ce que la venue a reellement emis.
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

pub fn handle_deposer_jupiter_lend(ctx: Context<DeposerJupiterLend>, actif: u64) -> Result<()> {
    let venue = ctx.accounts.programme_de_pret.key();

    // RAFRAICHISSEMENT D'ABORD, ET DANS LA MEME TRANSACTION. Les prix du marche
    // ne bougent que sur cette instruction : lus sans elle, ils sont faux
    // d'autant d'interets et de recompenses qu'il s'est ecoule de temps depuis
    // la derniere activite. Le notre avait cinq jours de retard le 02/08, donc
    // le risque n'est pas theorique. Ses cinq comptes figurent deja parmi les
    // dix-sept du depot : l'appel ne coute aucun compte supplementaire.
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

    // Lecture APRES rafraichissement. L'emprunt est referme avant la suite :
    // le compte est reemprunte par l'invocation croisee.
    let marche = {
        let donnees = ctx.accounts.marche.try_borrow_data()?;
        lending::lire_marche(&donnees).map_err(|e| error!(AllocatorError::from(e)))?
    };

    // LE MARCHE DOIT PARLER DE L'ACTIF QU'ON LUI PRESENTE. Sans ce controle,
    // un marche d'un autre actif accepterait les comptes et valoriserait le
    // depot avec des prix qui ne sont pas les siens.
    require!(
        marche.actif == ctx.accounts.actif.key().to_bytes(),
        AllocatorError::MarcheActifEtranger
    );
    require!(
        marche.jeton_de_recu == ctx.accounts.jeton_de_recu.key().to_bytes(),
        AllocatorError::MarcheJetonEtranger
    );

    // L'HORODATAGE EST JOURNALISE, PAS EXIGE, et c'est delibere. Exiger qu'il
    // tombe sur l'horloge de la transaction supposerait connaitre la facon dont
    // la venue le pose, ce que nous n'avons pas lu : une exigence fausse
    // ferait echouer tous les depots. La preuve devnet dira ce qu'il vaut
    // reellement apres un rafraichissement, et l'etape 2 pourra alors durcir.
    msg!(
        "marche rafraichi a {}, horloge {}",
        marche.dernier_rafraichissement,
        Clock::get()?.unix_timestamp
    );

    // Tout le calcul vit dans le module pur, comme dans le coffre : le
    // gestionnaire ne rejoue aucune arithmetique.
    let attendues =
        math::parts_attendues_pour_depot(actif, marche.prix_liquidite, marche.prix_jeton)
            .map_err(|e| error!(AllocatorError::from(e)))?;

    let actif_avant = ctx.accounts.actif_de_la_position.amount;
    let recu_avant = ctx.accounts.recu_de_la_position.amount;

    let depot = cpi::instruction_depot(
        venue,
        &cpi::ComptesDepot {
            signataire: ctx.accounts.position.key(),
            actif_du_deposant: ctx.accounts.actif_de_la_position.key(),
            recu_du_destinataire: ctx.accounts.recu_de_la_position.key(),
            actif: ctx.accounts.actif.key(),
            administration: ctx.accounts.administration.key(),
            marche: ctx.accounts.marche.key(),
            jeton_de_recu: ctx.accounts.jeton_de_recu.key(),
            reserves_de_liquidite: ctx.accounts.reserves_de_liquidite.key(),
            position_de_liquidite: ctx.accounts.position_de_liquidite.key(),
            modele_de_taux: ctx.accounts.modele_de_taux.key(),
            coffre_de_la_venue: ctx.accounts.coffre_de_la_venue.key(),
            liquidite: ctx.accounts.liquidite.key(),
            programme_de_liquidite: ctx.accounts.programme_de_liquidite.key(),
            modele_de_recompenses: ctx.accounts.modele_de_recompenses.key(),
            programme_de_jeton: ctx.accounts.programme_de_jeton.key(),
            programme_de_compte_associe: ctx.accounts.programme_de_compte_associe.key(),
            programme_systeme: ctx.accounts.programme_systeme.key(),
        },
        actif,
        // LA BORNE, remise a la venue. C'est la bretelle : elle est appliquee
        // par le programme qui emet, avant que quoi que ce soit ne soit ecrit.
        attendues,
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
        &depot,
        &[
            ctx.accounts.position.to_account_info(),
            ctx.accounts.actif_de_la_position.to_account_info(),
            ctx.accounts.recu_de_la_position.to_account_info(),
            ctx.accounts.actif.to_account_info(),
            ctx.accounts.administration.to_account_info(),
            ctx.accounts.marche.to_account_info(),
            ctx.accounts.jeton_de_recu.to_account_info(),
            ctx.accounts.reserves_de_liquidite.to_account_info(),
            ctx.accounts.position_de_liquidite.to_account_info(),
            ctx.accounts.modele_de_taux.to_account_info(),
            ctx.accounts.coffre_de_la_venue.to_account_info(),
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

    // LA CEINTURE. Deux soustractions sur des soldes que nous lisons
    // nous-memes, sans rien emprunter a l'arithmetique du tiers.
    ctx.accounts.actif_de_la_position.reload()?;
    ctx.accounts.recu_de_la_position.reload()?;

    let preleve = actif_avant
        .checked_sub(ctx.accounts.actif_de_la_position.amount)
        .ok_or(AllocatorError::SoldeIncoherent)?;
    // Compare a ce qui etait OFFERT, pas a une valeur recalculee : un depot ne
    // peut pas couter plus que son montant. L'inegalite plutot que l'egalite,
    // parce qu'une venue qui prendrait moins ne nous lese pas.
    require!(preleve <= actif, AllocatorError::ActifPreleveExcessif);

    let recues = ctx
        .accounts
        .recu_de_la_position
        .amount
        .checked_sub(recu_avant)
        .ok_or(AllocatorError::SoldeIncoherent)?;
    let ecart =
        math::verifier_plancher(recues, attendues).map_err(|e| error!(AllocatorError::from(e)))?;

    // L'ECART FAVORABLE EST DIT, PAS TU. Il ne justifie pas d'annuler, mais il
    // signale que l'arrondi de la venue a bouge, ce qui est une information
    // dont l'etape 3 fera un evenement.
    if ecart > 0 {
        msg!("ecart favorable de {} parts au-dela du plancher", ecart);
    }

    Ok(())
}
