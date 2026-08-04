//! Les deux sorties de Jupiter Lend, ordinaire et d'urgence.
//!
//! ELLES PARTAGENT LEUR STRUCTURE DE COMPTES, et c'est legitime ici alors que
//! le depot et le retrait ne partagent rien : l'IDL de l'editeur declare pour
//! `withdrawWithMaxSharesBurn` et `redeemWithMinAmountOut` la MEME liste, dans
//! le meme ordre, avec les memes droits. Un test le verifie plutot que de le
//! supposer, et si les deux listes divergeaient un jour, il tomberait.
//!
//! CE QUI LES DISTINGUE EST L'UNITE. Le retrait ordinaire se demande en actif
//! et se paie en parts, donc c'est le prix qui se plafonne. Le rachat se
//! demande en parts et rend de l'actif, donc c'est le produit qui se minore.
//! C'est cette seconde forme qui rend le chemin d'urgence possible : « sortir
//! tout » se dit « bruler tout mon solde », sans avoir a connaitre la valeur
//! exacte de la position.
//!
//! LES DEUX SORTIES RESTENT OUVERTES QUAND LA POSITION EST SUSPENDUE. Une
//! suspension protege des nouveaux depots ; si elle fermait aussi les sorties,
//! elle enfermerait les fonds dans la venue au moment precis ou l'on veut
//! pouvoir en sortir.
//!
//! LES BORNES VIENNENT DE L'APPELANT dans les deux cas, la ou le plancher du
//! depot est calcule sur la chaine. La conversion inverse n'a jamais ete
//! mesuree, et rien de ce que l'editeur publie ne la donne : la deduire
//! reviendrait a inventer une borne, et une borne trop serree fait echouer la
//! sortie le jour ou elle sert. Le controle qui protege reellement ne depend
//! d'aucune arithmetique : il compare des soldes avant et apres.

use crate::{
    error::AllocatorError,
    state::*,
    venues::jupiter_lend::{cpi, lending, math},
};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::{invoke, invoke_signed};
use anchor_spl::token_interface::TokenAccount;

/// Vingt et un comptes, dont dix-huit sont ceux de la venue. Le compte
/// supplementaire par rapport au depot est celui de reclamation.
#[derive(Accounts)]
pub struct SortirDeJupiterLend<'info> {
    pub admin: Signer<'info>,

    #[account(seeds = [CONFIGURATION_SEED], bump = configuration.bump, has_one = admin)]
    pub configuration: Account<'info, Configuration>,

    #[account(
        mut,
        seeds = [POSITION_SEED, position.coffre.as_ref(), position.marche.as_ref()],
        bump = position.bump,
        has_one = marche,
        has_one = actif,
        has_one = jeton_de_recu,
    )]
    pub position: Account<'info, Position>,

    /// CHECK: taille et discriminateur verifies par `lire_marche` ; identite
    /// verifiee par le `has_one` de la position.
    #[account(mut)]
    pub marche: UncheckedAccount<'info>,

    /// Actif detenu par la position, destination de la sortie.
    #[account(mut, token::authority = position, token::mint = actif)]
    pub actif_de_la_position: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Jetons de recu detenus par la position, source de la sortie.
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
    /// COMPTE DE RECLAMATION, propre aux sorties. Derive de l'administration de
    /// la venue et non du retireur, malgre une graine qui dit « user » : il en
    /// existe un seul par actif, et celui de l'USDC devnet existait deja.
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

impl<'info> SortirDeJupiterLend<'info> {
    /// Rafraichit les prix et rend le marche decode.
    ///
    /// Les deux sorties commencent par la, et pour la meme raison que le depot :
    /// une sortie valorisee sur des prix perimes brule le mauvais nombre de
    /// parts.
    fn rafraichir_et_lire(&self) -> Result<lending::Marche> {
        let rafraichir = cpi::instruction_rafraichir(
            self.programme_de_pret.key(),
            &cpi::ComptesRafraichir {
                marche: self.marche.key(),
                actif: self.actif.key(),
                jeton_de_recu: self.jeton_de_recu.key(),
                reserves_de_liquidite: self.reserves_de_liquidite.key(),
                modele_de_recompenses: self.modele_de_recompenses.key(),
            },
        );
        invoke(
            &rafraichir,
            &[
                self.marche.to_account_info(),
                self.actif.to_account_info(),
                self.jeton_de_recu.to_account_info(),
                self.reserves_de_liquidite.to_account_info(),
                self.modele_de_recompenses.to_account_info(),
                self.programme_de_pret.to_account_info(),
            ],
        )?;

        let donnees = self.marche.try_borrow_data()?;
        lending::lire_marche(&donnees).map_err(|e| error!(AllocatorError::from(e)))
    }

    fn comptes_de_la_venue(&self) -> cpi::ComptesRetrait {
        cpi::ComptesRetrait {
            signataire: self.position.key(),
            recu_du_proprietaire: self.recu_de_la_position.key(),
            actif_du_destinataire: self.actif_de_la_position.key(),
            administration: self.administration.key(),
            marche: self.marche.key(),
            actif: self.actif.key(),
            jeton_de_recu: self.jeton_de_recu.key(),
            reserves_de_liquidite: self.reserves_de_liquidite.key(),
            position_de_liquidite: self.position_de_liquidite.key(),
            modele_de_taux: self.modele_de_taux.key(),
            coffre_de_la_venue: self.coffre_de_la_venue.key(),
            compte_de_reclamation: self.compte_de_reclamation.key(),
            liquidite: self.liquidite.key(),
            programme_de_liquidite: self.programme_de_liquidite.key(),
            modele_de_recompenses: self.modele_de_recompenses.key(),
            programme_de_jeton: self.programme_de_jeton.key(),
            programme_de_compte_associe: self.programme_de_compte_associe.key(),
            programme_systeme: self.programme_systeme.key(),
        }
    }

    fn invoquer_signe(
        &self,
        instruction: &anchor_lang::solana_program::instruction::Instruction,
    ) -> Result<()> {
        let coffre = self.position.coffre;
        let marche = self.position.marche;
        let graines: &[&[u8]] = &[
            POSITION_SEED,
            coffre.as_ref(),
            marche.as_ref(),
            &[self.position.bump],
        ];
        invoke_signed(
            instruction,
            &[
                self.position.to_account_info(),
                self.recu_de_la_position.to_account_info(),
                self.actif_de_la_position.to_account_info(),
                self.administration.to_account_info(),
                self.marche.to_account_info(),
                self.actif.to_account_info(),
                self.jeton_de_recu.to_account_info(),
                self.reserves_de_liquidite.to_account_info(),
                self.position_de_liquidite.to_account_info(),
                self.modele_de_taux.to_account_info(),
                self.coffre_de_la_venue.to_account_info(),
                self.compte_de_reclamation.to_account_info(),
                self.liquidite.to_account_info(),
                self.programme_de_liquidite.to_account_info(),
                self.modele_de_recompenses.to_account_info(),
                self.programme_de_jeton.to_account_info(),
                self.programme_de_compte_associe.to_account_info(),
                self.programme_systeme.to_account_info(),
                self.programme_de_pret.to_account_info(),
            ],
            &[graines],
        )
        .map_err(Into::into)
    }
}

pub fn handle_retirer_jupiter_lend(ctx: Context<SortirDeJupiterLend>, actif: u64) -> Result<()> {
    let marche = ctx.accounts.rafraichir_et_lire()?;
    require!(
        lending::est_frais(&marche, Clock::get()?.unix_timestamp),
        AllocatorError::MarchePerime
    );

    // LE PLAFOND EST CALCULE ICI, PLUS FOURNI PAR L'APPELANT. C'etait une dette
    // nommee de l'etape 1 : la conversion inverse n'avait jamais ete mesuree, et
    // l'inventer aurait fait echouer tous les retraits. Elle l'a ete le 04/08
    // sur deux retraits reels, ce qui autorise a la rapatrier sur la chaine.
    //
    // La tolerance evite d'en refaire une egalite stricte : c'est leur arrondi,
    // pas le notre.
    let attendues = math::parts_a_bruler_pour_retrait(actif, marche.prix_jeton)
        .map_err(|e| error!(AllocatorError::from(e)))?;
    let parts_maximales = math::majorer(attendues, ctx.accounts.position.tolerance_bps)
        .map_err(|e| error!(AllocatorError::from(e)))?;

    let actif_avant = ctx.accounts.actif_de_la_position.amount;
    let recu_avant = ctx.accounts.recu_de_la_position.amount;

    let retrait = cpi::instruction_retrait(
        ctx.accounts.programme_de_pret.key(),
        &ctx.accounts.comptes_de_la_venue(),
        actif,
        parts_maximales,
    );
    ctx.accounts.invoquer_signe(&retrait)?;

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

/// Sort l'INTEGRALITE de la position vers son compte d'actif.
///
/// LE CHEMIN D'URGENCE. Il ne demande pas de montant : il brule le solde entier
/// de jetons de recu, quel qu'il soit. C'est ce qui permet de sortir sans avoir
/// a valoriser d'abord, au moment ou l'on veut surtout aller vite.
///
/// LE MINIMUM RESTE EXIGE de l'appelant. Un chemin d'urgence dont la borne
/// serait inventee echouerait le jour ou il sert ; poser zero est possible et
/// signifie « sortir a tout prix », ce qui reste une decision de l'operateur et
/// non un defaut de ce programme.
pub fn handle_racheter_tout(ctx: Context<SortirDeJupiterLend>) -> Result<()> {
    let marche = ctx.accounts.rafraichir_et_lire()?;
    require!(
        lending::est_frais(&marche, Clock::get()?.unix_timestamp),
        AllocatorError::MarchePerime
    );

    let actif_avant = ctx.accounts.actif_de_la_position.amount;
    let parts = ctx.accounts.recu_de_la_position.amount;
    require!(parts > 0, AllocatorError::PositionVide);

    // MEME RAPATRIEMENT QUE POUR LE RETRAIT. Le plancher est la valorisation du
    // solde entier, minoree de la tolerance gouvernee.
    let attendu = math::valeur_en_actif(parts, marche.prix_jeton)
        .map_err(|e| error!(AllocatorError::from(e)))?;
    let actif_minimal = math::minorer(attendu, ctx.accounts.position.tolerance_bps);

    let rachat = cpi::instruction_rachat(
        ctx.accounts.programme_de_pret.key(),
        &ctx.accounts.comptes_de_la_venue(),
        parts,
        actif_minimal,
    );
    ctx.accounts.invoquer_signe(&rachat)?;

    ctx.accounts.actif_de_la_position.reload()?;
    ctx.accounts.recu_de_la_position.reload()?;

    let recu = ctx
        .accounts
        .actif_de_la_position
        .amount
        .checked_sub(actif_avant)
        .ok_or(AllocatorError::SoldeIncoherent)?;
    require!(recu >= actif_minimal, AllocatorError::ActifInsuffisant);

    // LA POSITION DOIT ETRE VIDE, et le verifier n'est pas redondant avec la
    // borne : celle-ci porte sur l'actif recu, pas sur ce qui reste. Une venue
    // qui ne brulerait qu'une partie des parts rendrait assez d'actif pour
    // satisfaire le minimum tout en laissant une exposition derriere.
    require!(
        ctx.accounts.recu_de_la_position.amount == 0,
        AllocatorError::RachatIncomplet
    );

    msg!("rachat integral de {} parts contre {} unites", parts, recu);
    Ok(())
}
