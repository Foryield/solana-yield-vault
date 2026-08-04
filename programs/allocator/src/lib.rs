//! Allocateur : place l'actif d'un coffre sur des venues de rendement.
//!
//! Programme SEPARE du coffre, et pour une raison qui n'est pas d'organisation.
//! Un depot Jupiter Lend consomme dix-sept comptes, un retrait dix-huit : une
//! instruction qui porterait plusieurs venues depasserait ce qu'une transaction
//! sait transporter. D'ou un adaptateur par venue, une venue par instruction,
//! et la resolution des comptes hors chaine.
//!
//! ETAT : etapes 1 et 2 livrees et EPROUVEES SUR DEVNET, refus compris. Depot,
//! retrait et rachat integral passent par les variantes BORNEES de l'editeur.
//! Une position porte son plafond, sa suspension et la tolerance de ses bornes ;
//! seul l'administrateur agit. Signatures dans `docs/evidence/allocator.md`.
//!
//! TOUTES LES BORNES SONT CALCULEES SUR LA CHAINE, plus aucune n'est fournie par
//! l'appelant. Ce fut une dette de l'etape 1, tenue ouverte tant que la
//! conversion inverse de la venue n'avait pas ete mesuree ; elle l'a ete le
//! 04/08 sur deux retraits reels.
//!
//! Ce qui reste : le schema d'evenements, puis la reallocation entre venues,
//! qui suppose une SECONDE venue et n'a donc pas d'objet aujourd'hui.
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
    pub fn ouvrir_position(
        ctx: Context<OuvrirPosition>,
        plafond: u64,
        tolerance_bps: u16,
    ) -> Result<()> {
        handle_ouvrir_position(ctx, plafond, tolerance_bps)
    }

    /// Regle la tolerance des bornes de sortie, en dix-milliemes.
    pub fn regler_tolerance(ctx: Context<AdministrerPosition>, tolerance_bps: u16) -> Result<()> {
        handle_regler_tolerance(ctx, tolerance_bps)
    }

    /// Regle le plafond de protocole, qui borne la VALORISATION de la position.
    pub fn regler_plafond(ctx: Context<AdministrerPosition>, plafond: u64) -> Result<()> {
        handle_regler_plafond(ctx, plafond)
    }

    /// Ferme une position vide et rend son depot de non-expiration.
    ///
    /// Sert aussi de chemin de migration : une position ecrite par une version
    /// anterieure du programme ne se relit pas par la suivante si sa
    /// disposition a change. Fermer puis rouvrir est alors le chemin le plus
    /// court, et il est sans risque des lors que la position est sortie.
    pub fn fermer_position(ctx: Context<FermerPosition>) -> Result<()> {
        handle_fermer_position(ctx)
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

    /// Retire `actif` unites de Jupiter Lend.
    ///
    /// AUCUNE BORNE N'EST PASSEE : depuis que la conversion inverse a ete
    /// mesuree, le 04/08 sur deux retraits reels, le plafond de parts est
    /// calcule sur la chaine et majore de la tolerance de la position. C'etait
    /// une dette nommee de l'etape 1, elle est soldee.
    pub fn retirer_jupiter_lend(ctx: Context<SortirDeJupiterLend>, actif: u64) -> Result<()> {
        handle_retirer_jupiter_lend(ctx, actif)
    }

    /// CHEMIN D'URGENCE. Brule l'integralite du solde de jetons de recu.
    ///
    /// Aucun argument : ni montant, la position sort en entier, ni borne, elle
    /// est calculee sur la chaine depuis la valorisation du solde. C'est ce qui
    /// le rend utilisable sous incident, ou l'on ne veut ni valoriser d'abord ni
    /// se tromper de chiffre. Reste ouvert quand la position est suspendue : une
    /// suspension protege des depots, elle n'enferme pas les fonds.
    pub fn racheter_tout(ctx: Context<SortirDeJupiterLend>) -> Result<()> {
        handle_racheter_tout(ctx)
    }
}
