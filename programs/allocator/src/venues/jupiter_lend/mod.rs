//! Jupiter Lend, premiere venue.
//!
//! Trois programmes distincts chez l'editeur : pret, liquidite, recompenses.
//! Le compte de marche, nomme `Lending`, porte l'actif sous-jacent, le mint du
//! jeton de recu et DEUX prix d'echange qu'il ne faut pas confondre.
//!
//! Adresse du programme de pret sur devnet :
//! `7tjE28izRUjzmxC1QNXnNwcc4N82CNYCexf3k8mw67s3`. Elle est PROPRE A DEVNET :
//! le paquet publie par l'editeur code en dur celle du mainnet, absente d'ici.

pub mod cpi;
pub mod lending;
pub mod math;
