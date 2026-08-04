//! Graines des adresses derivees de l'allocateur.
//!
//! UNE AUTORITE PAR POSITION, c'est-a-dire par couple coffre et marche, et non
//! une par actif. Decision tranchee le 03/08 et argumentee dans le plan : un
//! adaptateur de venue parle a un programme tiers dont nous ne maitrisons ni
//! les evolutions ni les defauts, donc son defaut doit rester borne a sa venue
//! plutot que d'exposer tout l'actif du coffre.
//!
//! L'ETAPE 1 N'ATTACHE AUCUNE DONNEE A CETTE ADRESSE. Elle ne sert qu'a signer
//! les invocations croisees et a detenir les comptes de jeton. Les plafonds par
//! protocole et le chemin de retrait d'urgence arrivent a l'etape 2, et c'est
//! la que le compte prendra un contenu.

/// Graine de l'autorite de position, completee par la cle du coffre puis celle
/// du marche.
pub const POSITION_SEED: &[u8] = b"position";
