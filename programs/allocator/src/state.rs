//! Etat persistant de l'allocateur.
//!
//! DEUX COMPTES, ET LA SEPARATION PORTE UN SENS. La configuration dit QUI a le
//! droit d'agir, une fois pour tout le programme. La position dit CE QUI EST
//! PERMIS sur un couple coffre et marche, et elle est propre a ce couple.
//! Melanger les deux ferait d'un plafond une donnee globale, ce qui defait
//! l'isolation par venue que tout le reste du dessin cherche.

use anchor_lang::prelude::*;

/// Graine de la configuration. Un seul compte pour tout le programme.
pub const CONFIGURATION_SEED: &[u8] = b"configuration";

/// Tolerance maximale admise sur les bornes de sortie, en dix-milliemes : 1 %.
///
/// BORNEE PAR LE PROGRAMME et non laissee au seul jugement de l'administrateur.
/// Une tolerance libre permettrait d'en poser une si large qu'elle reviendrait a
/// n'avoir aucune borne, ce qui ne serait pas un reglage mais une desactivation
/// silencieuse. La valeur est basse a dessein : ce qu'on absorbe ici est une
/// derive d'ARRONDI chez un tiers, et un arrondi se compte en unites, jamais en
/// pourcents. Sur les montants mesures le 04/08, 1 % represente environ dix
/// mille fois l'ecart observe.
pub const TOLERANCE_MAXIMALE_BPS: u16 = 100;

/// Graine de l'autorite de position, completee par la cle du coffre puis celle
/// du marche.
///
/// UNE AUTORITE PAR POSITION, c'est-a-dire par couple coffre et marche, et non
/// une par actif. Decision tranchee le 03/08 et argumentee dans le plan : un
/// adaptateur de venue parle a un programme tiers dont nous ne maitrisons ni
/// les evolutions ni les defauts, donc son defaut doit rester borne a sa venue
/// plutot que d'exposer tout l'actif du coffre.
pub const POSITION_SEED: &[u8] = b"position";

/// Qui a le droit d'agir sur les positions de cet allocateur.
///
/// PROPRE A L'ALLOCATEUR PLUTOT QU'EMPRUNTEE AU COFFRE, et c'est un choix
/// argumente. Lire l'administrateur dans le compte du coffre donnerait une
/// source unique, mais recreerait le couplage que la conception a defait en
/// separant les deux programmes : l'allocateur dependrait de la disposition
/// d'un compte qu'il ne possede pas, et un changement du coffre le casserait en
/// silence.
///
/// Le prix est assume : « qui gouverne cet actif » existe des lors a deux
/// endroits, et rien n'oblige les deux a concorder. C'est une divergence a
/// surveiller en exploitation, pas une impossibilite.
#[account]
#[derive(InitSpace)]
pub struct Configuration {
    /// Seul habilite a ouvrir une position, regler son plafond, la suspendre et
    /// declencher un retrait integral.
    pub admin: Pubkey,
    pub bump: u8,
}

/// Ce qui est permis sur un couple coffre et marche.
///
/// CE COMPTE VIT A L'ADRESSE QUI SIGNE LES INVOCATIONS CROISEES. L'etape 1 n'y
/// attachait aucune donnee : l'adresse ne servait qu'a signer et a detenir les
/// comptes de jeton. Elle porte desormais l'etat, sans changer d'adresse, donc
/// sans invalider les comptes de jeton deja crees.
#[account]
#[derive(InitSpace)]
pub struct Position {
    /// Coffre servi. Redondant avec la graine, et conserve pour qu'un lecteur
    /// hors chaine sache de quoi parle ce compte sans redériver l'adresse.
    pub coffre: Pubkey,
    /// Marche de la venue.
    pub marche: Pubkey,
    /// Actif place. Fige a l'ouverture : le marche le declare, et un marche ne
    /// change pas d'actif.
    pub actif: Pubkey,
    /// Jeton de recu de la venue, fige a l'ouverture pour la meme raison.
    pub jeton_de_recu: Pubkey,
    /// PLAFOND DE PROTOCOLE, en unites d'actif, porte sur la VALORISATION de la
    /// position et non sur le cumul depose.
    ///
    /// Les interets peuvent porter la valorisation au-dessus de ce plafond sans
    /// aucun geste de notre part. Cela bloque alors les nouveaux depots et ne
    /// force rien a sortir : un plafond dit ce qu'on accepte d'exposer de plus,
    /// il n'ordonne pas de liquider.
    pub plafond: u64,
    /// TOLERANCE DES BORNES DE SORTIE, en dix-milliemes.
    ///
    /// Les bornes des sorties sont calculees sur la chaine depuis la conversion
    /// de la venue, MESUREE le 04/08 sur deux retraits reels. Les poser
    /// exactement reproduirait la faute que ce dessin reproche a l'egalite
    /// stricte : un changement d'arrondi chez un tiers deviendrait une panne
    /// totale de nos sorties, alors que rien n'aurait ete vole.
    ///
    /// Cette tolerance est donc l'ecart qu'on accepte entre leur arithmetique et
    /// la notre. Elle est GOUVERNEE et non codee en dur, au meme titre que le
    /// plafond : c'est une decision visible et revisable, pas une constante
    /// oubliee dans un fichier.
    pub tolerance_bps: u16,
    /// Coupe-circuit de la position. Suspendre bloque les nouveaux depots sans
    /// rien deplacer ; retraits et retrait integral restent ouverts, sans quoi
    /// la suspension enfermerait les fonds au lieu de les proteger.
    pub suspendue: bool,
    pub bump: u8,
}
