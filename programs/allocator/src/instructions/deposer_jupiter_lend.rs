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
//!
//! TROIS GARDES S'AJOUTENT A L'ETAPE 2, et elles ne sont pas de meme nature.
//! L'administrateur est exige, sans quoi n'importe qui deciderait quand les
//! fonds bougent. La suspension bloque avant tout mouvement. Le plafond, lui,
//! est verifie APRES l'invocation croisee, sur le solde reellement constate :
//! la transaction etant atomique, un depassement annule tout, et verifier apres
//! supprime l'ecart entre ce qu'on avait prevu et ce qui s'est passe.

use crate::{
    error::AllocatorError,
    state::*,
    venues::jupiter_lend::{cpi, lending, math},
};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::{invoke, invoke_signed};
use anchor_spl::token_interface::TokenAccount;

#[derive(Accounts)]
pub struct DeposerJupiterLend<'info> {
    /// SEUL HABILITE. L'etape 1 acceptait n'importe quel signataire, ce qui ne
    /// permettait aucun vol mais laissait un tiers decider quand nos fonds
    /// bougeaient.
    pub admin: Signer<'info>,

    #[account(seeds = [CONFIGURATION_SEED], bump = configuration.bump, has_one = admin)]
    pub configuration: Account<'info, Configuration>,

    /// Position, a l'adresse meme qui signe les invocations croisees.
    ///
    /// Les trois `has_one` remplacent autant de verifications ecrites a la main
    /// dans le corps du gestionnaire a l'etape 1. L'actif et le jeton de recu
    /// ont ete lus dans le marche a l'ouverture et figes : plus rien ne peut
    /// presenter un mint qui n'est pas celui de cette position.
    #[account(
        mut,
        seeds = [POSITION_SEED, position.coffre.as_ref(), position.marche.as_ref()],
        bump = position.bump,
        has_one = marche,
        has_one = actif,
        has_one = jeton_de_recu,
    )]
    pub position: Account<'info, Position>,

    /// Compte de marche de la venue, decode par `lire_marche` APRES le
    /// rafraichissement des prix.
    /// CHECK: taille et discriminateur verifies par `lire_marche` ; identite
    /// verifiee par le `has_one` de la position.
    #[account(mut)]
    pub marche: UncheckedAccount<'info>,

    /// Actif detenu par la position, source du depot.
    #[account(mut, token::authority = position, token::mint = actif)]
    pub actif_de_la_position: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Jetons de recu detenus par la position, destination du depot. C'est le
    /// solde de CE compte qui mesure ce que la venue a reellement emis, et sur
    /// lui que le plafond est verifie.
    #[account(mut, token::authority = position, token::mint = jeton_de_recu)]
    pub recu_de_la_position: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: identite verifiee par le `has_one` de la position.
    pub actif: UncheckedAccount<'info>,
    /// CHECK: identite verifiee par le `has_one` de la position.
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
    require!(
        !ctx.accounts.position.suspendue,
        AllocatorError::PositionSuspendue
    );

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

    // L'HORODATAGE EST DESORMAIS EXIGE, plus seulement journalise : la mesure
    // du 04/08 a montre qu'il tombe exactement sur l'horloge de la transaction.
    // La regle vit dans le module pur, ou elle est testable ; ici on ne fait que
    // lui donner l'horloge.
    require!(
        lending::est_frais(&marche, Clock::get()?.unix_timestamp),
        AllocatorError::MarchePerime
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

    let coffre = ctx.accounts.position.coffre;
    let marche_cle = ctx.accounts.position.marche;
    let graines: &[&[u8]] = &[
        POSITION_SEED,
        coffre.as_ref(),
        marche_cle.as_ref(),
        &[ctx.accounts.position.bump],
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

    let recu_apres = ctx.accounts.recu_de_la_position.amount;
    let recues = recu_apres
        .checked_sub(recu_avant)
        .ok_or(AllocatorError::SoldeIncoherent)?;
    let ecart =
        math::verifier_plancher(recues, attendues).map_err(|e| error!(AllocatorError::from(e)))?;

    // L'ECART FAVORABLE EST DIT, PAS TU. Mesure le 04/08 : il vaut une part,
    // parce que la venue applique la formule simplifiee la ou notre conversion
    // en deux temps minore. C'est precisement ce qu'un plancher tolere et
    // qu'une egalite stricte aurait refuse.
    if ecart > 0 {
        msg!("ecart favorable de {} parts au-dela du plancher", ecart);
    }

    // LE PLAFOND, VERIFIE APRES ET SUR LE SOLDE REEL. Il porte sur la
    // VALORISATION et non sur le cumul depose : une position croit par les
    // seuls interets, et c'est cette croissance qu'un plafond doit voir.
    let valeur = math::valeur_en_actif(recu_apres, marche.prix_jeton)
        .map_err(|e| error!(AllocatorError::from(e)))?;
    require!(
        valeur <= ctx.accounts.position.plafond,
        AllocatorError::PlafondDepasse
    );
    msg!(
        "position valorisee a {} pour un plafond de {}",
        valeur,
        ctx.accounts.position.plafond
    );

    Ok(())
}
