//! Un adaptateur par venue de rendement.
//!
//! Chaque venue impose ses comptes, son arithmetique et ses pieges ; les
//! melanger dans un module commun ferait porter a chacune les contraintes des
//! autres. La conception prevoit un plafond par protocole et un chemin de
//! retrait d'urgence pour chacune.

pub mod jupiter_lend;
