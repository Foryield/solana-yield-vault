//! Composition des instructions de Jupiter Lend. Fonctions PURES.
//!
//! Aucun appel reseau ici : ces fonctions fabriquent des instructions, elles ne
//! les invoquent pas. C'est ce qui les rend mesurables par la couverture et
//! eprouvables sans validateur, alors qu'elles portent la partie la plus facile
//! a se tromper de toute l'integration : l'ordre des comptes.
//!
//! L'ORDRE VIENT DE L'IDL PUBLIE PAR L'EDITEUR, releve le 02/08. Il n'est ni
//! devine ni deduit d'une autre instruction, et surtout PAS PARTAGE entre depot
//! et retrait : les deux listes different par deux positions echangees et un
//! compte insere au milieu. Un compte au mauvais rang produit l'echec le plus
//! opaque de Solana, celui qui ne nomme rien.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};

/// Discriminateurs des instructions, releves dans l'IDL et verifies conformes a
/// la convention `sha256("global:<nom>")[0..8]` le 02/08.
pub const DISCRIMINATEUR_RAFRAICHIR: [u8; 8] = [24, 225, 53, 189, 72, 212, 225, 178];
pub const DISCRIMINATEUR_DEPOT: [u8; 8] = [242, 35, 198, 137, 82, 225, 242, 182];

/// Les cinq comptes du rafraichissement de taux.
///
/// TOUS FIGURENT DEJA parmi les dix-sept du depot : appeler cette instruction
/// dans la meme transaction ne coute donc aucun compte supplementaire, ce qui
/// retire le seul argument qu'on aurait pu opposer a la contrainte de fraicheur.
pub struct ComptesRafraichir {
    pub marche: Pubkey,
    pub actif: Pubkey,
    pub jeton_de_recu: Pubkey,
    pub reserves_de_liquidite: Pubkey,
    pub modele_de_recompenses: Pubkey,
}

/// Rafraichit les prix d'echange du marche.
///
/// A APPELER AVANT TOUT CALCUL. Les prix ne bougent que sur cette instruction,
/// et un marche peu actif peut etre tres en retard : le notre l'etait de cinq
/// jours quand il a ete releve.
pub fn instruction_rafraichir(programme: Pubkey, c: &ComptesRafraichir) -> Instruction {
    Instruction {
        program_id: programme,
        accounts: vec![
            AccountMeta::new(c.marche, false),
            AccountMeta::new_readonly(c.actif, false),
            AccountMeta::new_readonly(c.jeton_de_recu, false),
            AccountMeta::new_readonly(c.reserves_de_liquidite, false),
            AccountMeta::new_readonly(c.modele_de_recompenses, false),
        ],
        data: DISCRIMINATEUR_RAFRAICHIR.to_vec(),
    }
}

/// Les dix-sept comptes du depot, dans l'ordre de l'IDL.
///
/// Les champs sont nommes et non collectes dans un tableau : une liste
/// positionnelle se remplit dans le desordre sans que rien ne s'en apercoive,
/// alors qu'un champ manquant ne compile pas.
pub struct ComptesDepot {
    pub signataire: Pubkey,
    pub actif_du_deposant: Pubkey,
    pub recu_du_destinataire: Pubkey,
    pub actif: Pubkey,
    pub administration: Pubkey,
    pub marche: Pubkey,
    pub jeton_de_recu: Pubkey,
    pub reserves_de_liquidite: Pubkey,
    pub position_de_liquidite: Pubkey,
    pub modele_de_taux: Pubkey,
    pub coffre_de_la_venue: Pubkey,
    pub liquidite: Pubkey,
    pub programme_de_liquidite: Pubkey,
    pub modele_de_recompenses: Pubkey,
    pub programme_de_jeton: Pubkey,
    pub programme_de_compte_associe: Pubkey,
    pub programme_systeme: Pubkey,
}

/// Depose `actif` unites et recoit des jetons de recu.
///
/// Le montant est en unites minimales, comme partout dans ce depot, et encode
/// en petit-boutiste derriere le discriminateur.
pub fn instruction_depot(programme: Pubkey, c: &ComptesDepot, actif: u64) -> Instruction {
    let mut data = DISCRIMINATEUR_DEPOT.to_vec();
    data.extend_from_slice(&actif.to_le_bytes());

    Instruction {
        program_id: programme,
        accounts: vec![
            AccountMeta::new(c.signataire, true),
            AccountMeta::new(c.actif_du_deposant, false),
            AccountMeta::new(c.recu_du_destinataire, false),
            AccountMeta::new_readonly(c.actif, false),
            AccountMeta::new_readonly(c.administration, false),
            AccountMeta::new(c.marche, false),
            AccountMeta::new(c.jeton_de_recu, false),
            AccountMeta::new(c.reserves_de_liquidite, false),
            AccountMeta::new(c.position_de_liquidite, false),
            AccountMeta::new_readonly(c.modele_de_taux, false),
            AccountMeta::new(c.coffre_de_la_venue, false),
            AccountMeta::new(c.liquidite, false),
            AccountMeta::new(c.programme_de_liquidite, false),
            AccountMeta::new_readonly(c.modele_de_recompenses, false),
            AccountMeta::new_readonly(c.programme_de_jeton, false),
            AccountMeta::new_readonly(c.programme_de_compte_associe, false),
            AccountMeta::new_readonly(c.programme_systeme, false),
        ],
        data,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Une cle distincte par position, pour que l'ordre se lise dans le test.
    fn cle(n: u8) -> Pubkey {
        Pubkey::new_from_array([n; 32])
    }

    fn comptes_depot() -> ComptesDepot {
        ComptesDepot {
            signataire: cle(1),
            actif_du_deposant: cle(2),
            recu_du_destinataire: cle(3),
            actif: cle(4),
            administration: cle(5),
            marche: cle(6),
            jeton_de_recu: cle(7),
            reserves_de_liquidite: cle(8),
            position_de_liquidite: cle(9),
            modele_de_taux: cle(10),
            coffre_de_la_venue: cle(11),
            liquidite: cle(12),
            programme_de_liquidite: cle(13),
            modele_de_recompenses: cle(14),
            programme_de_jeton: cle(15),
            programme_de_compte_associe: cle(16),
            programme_systeme: cle(17),
        }
    }

    /// LE TEST QUI PORTE TOUT. Chaque compte est a son rang, et le rang vient
    /// de l'IDL. Une permutation ne se verrait pas a la compilation.
    #[test]
    fn le_depot_place_ses_dix_sept_comptes_dans_l_ordre_de_l_idl() {
        let ix = instruction_depot(cle(99), &comptes_depot(), 1);
        assert_eq!(ix.accounts.len(), 17);
        for (rang, meta) in ix.accounts.iter().enumerate() {
            assert_eq!(meta.pubkey, cle(rang as u8 + 1));
        }
    }

    /// Un compte declare en lecture seule alors qu'il doit etre ecrit fait
    /// echouer la transaction a l'execution, sans rien nommer d'utile.
    #[test]
    fn le_depot_declare_les_bons_droits_d_ecriture() {
        let ix = instruction_depot(cle(99), &comptes_depot(), 1);
        let en_ecriture: Vec<usize> = ix
            .accounts
            .iter()
            .enumerate()
            .filter(|(_, m)| m.is_writable)
            .map(|(i, _)| i + 1)
            .collect();
        assert_eq!(en_ecriture, vec![1, 2, 3, 6, 7, 8, 9, 11, 12, 13]);
    }

    /// Un seul signataire, et c'est le premier compte. L'allocateur signera par
    /// adresse derivee : s'il y en avait un second, il faudrait le savoir.
    #[test]
    fn le_depot_n_attend_qu_un_signataire() {
        let ix = instruction_depot(cle(99), &comptes_depot(), 1);
        let signataires: Vec<usize> = ix
            .accounts
            .iter()
            .enumerate()
            .filter(|(_, m)| m.is_signer)
            .map(|(i, _)| i)
            .collect();
        assert_eq!(signataires, vec![0]);
    }

    #[test]
    fn le_depot_encode_son_montant_en_petit_boutiste() {
        let ix = instruction_depot(cle(99), &comptes_depot(), 500_000);
        assert_eq!(ix.data[0..8], DISCRIMINATEUR_DEPOT);
        assert_eq!(ix.data.len(), 16);
        assert_eq!(&ix.data[8..16], &500_000u64.to_le_bytes());
    }

    #[test]
    fn le_depot_vise_le_programme_qu_on_lui_donne() {
        let ix = instruction_depot(cle(99), &comptes_depot(), 1);
        assert_eq!(ix.program_id, cle(99));
    }

    /// Le rafraichissement ne porte AUCUN argument : son discriminateur seul
    /// tient lieu de charge utile.
    #[test]
    fn le_rafraichissement_n_a_pas_d_argument() {
        let c = ComptesRafraichir {
            marche: cle(1),
            actif: cle(2),
            jeton_de_recu: cle(3),
            reserves_de_liquidite: cle(4),
            modele_de_recompenses: cle(5),
        };
        let ix = instruction_rafraichir(cle(99), &c);
        assert_eq!(ix.data, DISCRIMINATEUR_RAFRAICHIR.to_vec());
        assert_eq!(ix.accounts.len(), 5);
        // Seul le marche est ecrit : c'est lui qui porte les prix.
        assert!(ix.accounts[0].is_writable);
        assert!(ix.accounts[1..].iter().all(|m| !m.is_writable));
        assert!(ix.accounts.iter().all(|m| !m.is_signer));
    }

    /// Les cinq comptes du rafraichissement se retrouvent tous parmi les
    /// dix-sept du depot. C'est ce qui rend la contrainte de fraicheur gratuite
    /// en budget de taille, et le verifier evite de le tenir pour acquis.
    #[test]
    fn le_rafraichissement_ne_demande_aucun_compte_absent_du_depot() {
        let d = comptes_depot();
        let r = ComptesRafraichir {
            marche: d.marche,
            actif: d.actif,
            jeton_de_recu: d.jeton_de_recu,
            reserves_de_liquidite: d.reserves_de_liquidite,
            modele_de_recompenses: d.modele_de_recompenses,
        };
        let depot = instruction_depot(cle(99), &d, 1);
        let rafraichir = instruction_rafraichir(cle(99), &r);
        let du_depot: Vec<Pubkey> = depot.accounts.iter().map(|m| m.pubkey).collect();
        assert!(rafraichir
            .accounts
            .iter()
            .all(|m| du_depot.contains(&m.pubkey)));
    }
}
