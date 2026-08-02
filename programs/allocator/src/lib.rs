//! Allocateur : place l'actif d'un coffre sur des venues de rendement.
//!
//! Programme SEPARE du coffre, et pour une raison qui n'est pas d'organisation.
//! Un depot Jupiter Lend consomme dix-sept comptes, un retrait dix-huit : une
//! instruction qui porterait plusieurs venues depasserait ce qu'une transaction
//! sait transporter. D'ou un adaptateur par venue, une venue par instruction,
//! et la resolution des comptes hors chaine.
//!
//! ETAT : squelette. Seule l'arithmetique de la premiere venue est ecrite, et
//! c'est deliberer : elle doit etre juste avant que quoi que ce soit l'appelle.
//! Les instructions viennent avec l'etape 1 du plan, qui clot le spike S4.
//!
//! Plan : `docs/plans/2026-08-02-allocateur-plan.md`.

pub mod venues;

use anchor_lang::prelude::*;

// Adresse issue de la paire de cles generee le 02/08, qui reste HORS du depot
// sous `target/deploy/`. Le programme n'est PAS ENCORE DEPLOYE : cette adresse
// est celle qu'il prendra, et elle ne sera consignee dans `docs/evidence/` que
// le jour ou un binaire y repondra. `anchor build` reecrit cette ligne s'il ne
// retrouve pas la paire, ce qui est la raison pour laquelle rien ici ne doit
// etre tenu pour stable sans preuve.
declare_id!("BjQJMxT5m4wb6nLBnA91s446hTsj1AL9RiwxVEk2rgGr");

#[program]
pub mod allocator {}
