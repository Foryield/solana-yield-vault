//! Allocateur : place l'actif d'un coffre sur des venues de rendement.
//!
//! Programme SEPARE du coffre, et pour une raison qui n'est pas d'organisation.
//! Un depot Jupiter Lend consomme dix-sept comptes, un retrait dix-huit : une
//! instruction qui porterait plusieurs venues depasserait ce qu'une transaction
//! sait transporter. D'ou un adaptateur par venue, une venue par instruction,
//! et la resolution des comptes hors chaine.
//!
//! ETAT : etape 1 ecrite, depot et retrait Jupiter Lend cables. Les deux
//! passent par les variantes BORNEES de l'editeur, la ou une premiere lecture
//! de l'IDL n'avait vu que les variantes nues. Les plafonds par protocole et le
//! chemin de retrait d'urgence arrivent a l'etape 2.
//!
//! CE PROGRAMME N'EST PAS ENCORE EPROUVE SUR UN RESEAU. Le critere de sortie de
//! l'etape 1, donc du spike S4, est un depot et un retrait reussis sur devnet
//! avec leurs signatures consignees sous `docs/evidence/`. Tant que cela
//! n'existe pas, ce qui est ecrit ici est verifie contre l'IDL de l'editeur et
//! rien d'autre.
//!
//! Plan : `docs/plans/2026-08-02-allocateur-plan.md`.

pub mod error;
pub mod instructions;
pub mod state;
pub mod venues;

use anchor_lang::prelude::*;
use instructions::*;

// Adresse issue de la paire de cles generee le 02/08, qui reste HORS du depot
// sous `target/deploy/`. Le programme n'est PAS ENCORE DEPLOYE : cette adresse
// est celle qu'il prendra, et elle ne sera consignee dans `docs/evidence/` que
// le jour ou un binaire y repondra. `anchor build` reecrit cette ligne s'il ne
// retrouve pas la paire, ce qui est la raison pour laquelle rien ici ne doit
// etre tenu pour stable sans preuve.
declare_id!("BjQJMxT5m4wb6nLBnA91s446hTsj1AL9RiwxVEk2rgGr");

#[program]
pub mod allocator {
    use super::*;

    /// Fige l'administrateur de l'allocateur. Appelable une seule fois.
    pub fn initialiser(ctx: Context<Initialiser>) -> Result<()> {
        handle_initialiser(ctx)
    }

    /// Ouvre une position sur un couple coffre et marche, avec son plafond.
    pub fn ouvrir_position(ctx: Context<OuvrirPosition>, plafond: u64) -> Result<()> {
        handle_ouvrir_position(ctx, plafond)
    }

    /// Regle le plafond de protocole, qui borne la VALORISATION de la position.
    pub fn regler_plafond(ctx: Context<AdministrerPosition>, plafond: u64) -> Result<()> {
        handle_regler_plafond(ctx, plafond)
    }

    /// Suspend ou reprend la position. Ne bloque que les depots.
    pub fn suspendre(ctx: Context<AdministrerPosition>, suspendue: bool) -> Result<()> {
        handle_suspendre(ctx, suspendue)
    }

    /// Depose `actif` unites sur Jupiter Lend depuis la position du coffre.
    ///
    /// Le plancher n'est PAS un argument : il est calcule sur la chaine, apres
    /// rafraichissement des prix, par le module d'arithmetique deja mesure
    /// contre le marche reel. Le faire venir de l'exterieur laisserait un
    /// appelant desarmer la protection en passant zero.
    pub fn deposer_jupiter_lend(ctx: Context<DeposerJupiterLend>, actif: u64) -> Result<()> {
        handle_deposer_jupiter_lend(ctx, actif)
    }

    /// Retire `actif` unites de Jupiter Lend en brulant au plus
    /// `parts_maximales` jetons de recu.
    ///
    /// Le plafond, LUI, est un argument, et l'asymetrie avec le depot est
    /// argumentee dans l'en-tete du gestionnaire : la conversion inverse n'a
    /// jamais ete mesuree, et une borne deduite plutot que mesuree ferait
    /// echouer tous les retraits.
    pub fn retirer_jupiter_lend(
        ctx: Context<SortirDeJupiterLend>,
        actif: u64,
        parts_maximales: u64,
    ) -> Result<()> {
        handle_retirer_jupiter_lend(ctx, actif, parts_maximales)
    }

    /// CHEMIN D'URGENCE. Brule l'integralite du solde de jetons de recu contre
    /// au moins `actif_minimal` unites.
    ///
    /// Libelle en parts et non en actif, ce qui permet de sortir sans avoir a
    /// valoriser d'abord. Reste ouvert quand la position est suspendue : une
    /// suspension protege des depots, elle n'enferme pas les fonds.
    pub fn racheter_tout(ctx: Context<SortirDeJupiterLend>, actif_minimal: u64) -> Result<()> {
        handle_racheter_tout(ctx, actif_minimal)
    }
}
