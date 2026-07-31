//! Coffre de rendement (ossature).
//!
//! ETAT : ossature d'amorcage. Aucune instruction n'est implementee, et c'est
//! deliberé : la regle du depot interdit d'ecrire du programme avant que les
//! trois spikes bloquants aient rendu leur verdict, et S1 (ce qui declenche
//! reellement le hook de transfert Token-2022) est encore ouvert. Son issue
//! peut changer la forme des parts, donc celle du coffre.
//!
//! Ce que ce fichier sert aujourd'hui : figer l'identifiant de programme et
//! prouver la chaine complete, de la compilation au deploiement devnet.
//!
//! Conception : `docs/plans/2026-07-31-solana-yield-vault-design.md`.
//!
//! DECOUPAGE IMPOSE PAR S2, a respecter des la premiere instruction :
//! l'arithmetique (parts, valorisation, arrondis, gardes) vit dans des
//! fonctions PURES sous un module dedie, testees cote hote ; les gestionnaires
//! d'instruction se reduisent a du cablage. Un instrument de couverture ne voit
//! rien du chemin BPF qu'emprunte LiteSVM : sans ce decoupage, aucun seuil de
//! couverture n'a de sens. Mesure a l'appui dans le verdict S2.

use anchor_lang::prelude::*;

declare_id!("2bkjZG8njXHQ1tdj5aRSiwjjndX1qEvjFYzBYJQjNysw");

#[program]
pub mod yield_vault {}
