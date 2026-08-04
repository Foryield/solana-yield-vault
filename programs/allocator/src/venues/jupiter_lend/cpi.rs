//! Composition des instructions de Jupiter Lend. Fonctions PURES.
//!
//! Aucun appel reseau ici : ces fonctions fabriquent des instructions, elles ne
//! les invoquent pas. C'est ce qui les rend mesurables par la couverture et
//! eprouvables sans validateur, alors qu'elles portent la partie la plus facile
//! a se tromper de toute l'integration : l'ordre des comptes.
//!
//! L'ORDRE VIENT DE L'IDL PUBLIE PAR L'EDITEUR, releve le 02/08 et relu le
//! 04/08 sur le paquet `@jup-ag/lend` 0.1.10. Il n'est ni devine ni deduit
//! d'une autre instruction, et surtout PAS PARTAGE entre depot et retrait : les
//! deux listes different par une ROTATION des rangs quatre a six et par un
//! compte insere au milieu. Un compte au mauvais rang produit l'echec le plus
//! opaque de Solana, celui qui ne nomme rien.
//!
//! LES DEUX INSTRUCTIONS EMPLOYEES SONT LES VARIANTES BORNEES, et c'est une
//! decision : l'editeur expose `deposit` et `withdraw` nus, mais aussi
//! `depositWithMinAmountOut` et `withdrawWithMaxSharesBurn`, qui portent la
//! borne dans leur charge utile et la font respecter par le programme qui emet
//! reellement les jetons. Memes comptes, meme ordre, un argument de plus. La
//! relecture du 04/08 les a trouvees ; celle du 02/08 les avait manquees.
//! L'allocateur ne compose donc JAMAIS un mouvement non borne : la variante nue
//! n'est pas exposee ici, pour qu'aucun appelant ne puisse en fabriquer un.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};

/// Discriminateurs des instructions, releves dans l'IDL et verifies conformes a
/// la convention `sha256("global:<nom>")[0..8]`.
pub const DISCRIMINATEUR_RAFRAICHIR: [u8; 8] = [24, 225, 53, 189, 72, 212, 225, 178];
/// `depositWithMinAmountOut`, et non `deposit` : voir l'en-tete du module.
pub const DISCRIMINATEUR_DEPOT: [u8; 8] = [116, 144, 16, 97, 118, 109, 40, 119];
/// `withdrawWithMaxSharesBurn`, et non `withdraw` : voir l'en-tete du module.
pub const DISCRIMINATEUR_RETRAIT: [u8; 8] = [47, 197, 183, 171, 239, 18, 245, 171];
/// `redeemWithMinAmountOut`, et non `redeem` : voir l'en-tete du module.
pub const DISCRIMINATEUR_RACHAT: [u8; 8] = [235, 189, 237, 56, 166, 180, 184, 149];

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

/// Depose `actif` unites et recoit AU MOINS `parts_minimales` jetons de recu.
///
/// Les deux montants sont en unites minimales, comme partout dans ce depot, et
/// encodes en petit-boutiste derriere le discriminateur, dans l'ordre de l'IDL :
/// `assets` puis `minAmountOut`.
///
/// LA BORNE EST FAITE RESPECTER PAR L'EDITEUR, ce qui change la nature de notre
/// arithmetique : elle n'a plus a reproduire leur arrondi, seulement a le
/// MINORER. Un changement d'arrondi chez eux ne casse donc plus notre coffre,
/// ce qui etait le seul reproche fait a l'egalite stricte. L'allocateur mesure
/// quand meme le solde avant et apres, pour constater plutot que croire.
pub fn instruction_depot(
    programme: Pubkey,
    c: &ComptesDepot,
    actif: u64,
    parts_minimales: u64,
) -> Instruction {
    let mut data = DISCRIMINATEUR_DEPOT.to_vec();
    data.extend_from_slice(&actif.to_le_bytes());
    data.extend_from_slice(&parts_minimales.to_le_bytes());

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

/// Les dix-huit comptes du retrait, dans l'ordre de l'IDL.
///
/// CETTE LISTE N'EST PAS CELLE DU DEPOT, et elle ne s'en deduit pas. Deux
/// differences, toutes deux silencieuses si on les manque. D'abord une
/// ROTATION des rangs quatre a six, et non un echange deux a deux : `actif`
/// descend du rang quatre au rang six, `administration` remonte du cinq au
/// quatre, `marche` remonte du six au cinq. Ensuite `compte_de_reclamation`
/// s'insere au rang douze, decalant d'un cran tout ce qui suit. Les champs
/// sont donc redeclares en entier plutot que partages avec le depot : un
/// facteur commun ici economiserait quinze lignes et couterait un compte au
/// mauvais rang.
pub struct ComptesRetrait {
    pub signataire: Pubkey,
    pub recu_du_proprietaire: Pubkey,
    pub actif_du_destinataire: Pubkey,
    pub administration: Pubkey,
    pub marche: Pubkey,
    pub actif: Pubkey,
    pub jeton_de_recu: Pubkey,
    pub reserves_de_liquidite: Pubkey,
    pub position_de_liquidite: Pubkey,
    pub modele_de_taux: Pubkey,
    pub coffre_de_la_venue: Pubkey,
    /// N'EXISTE QUE COTE RETRAIT. Adresse derivee du programme de recompenses,
    /// que rien ne cree automatiquement : elle doit exister AVANT le premier
    /// retrait, et c'est un prealable d'exploitation, pas un detail.
    pub compte_de_reclamation: Pubkey,
    pub liquidite: Pubkey,
    pub programme_de_liquidite: Pubkey,
    pub modele_de_recompenses: Pubkey,
    pub programme_de_jeton: Pubkey,
    pub programme_de_compte_associe: Pubkey,
    pub programme_systeme: Pubkey,
}

/// Retire `actif` unites en brulant AU PLUS `parts_maximales` jetons de recu.
///
/// LA BORNE EST DANS L'AUTRE SENS QUE CELLE DU DEPOT, et c'est ce qui la rend
/// juste : au depot on exige un minimum recu, au retrait on impose un maximum
/// paye. Les deux protegent contre le meme evenement, un tiers qui rendrait
/// moins que prevu, mais un retrait se demande en unites d'actif et se paie en
/// parts, donc c'est le prix qui se plafonne.
pub fn instruction_retrait(
    programme: Pubkey,
    c: &ComptesRetrait,
    actif: u64,
    parts_maximales: u64,
) -> Instruction {
    let mut data = DISCRIMINATEUR_RETRAIT.to_vec();
    data.extend_from_slice(&actif.to_le_bytes());
    data.extend_from_slice(&parts_maximales.to_le_bytes());

    Instruction {
        program_id: programme,
        accounts: vec![
            AccountMeta::new(c.signataire, true),
            AccountMeta::new(c.recu_du_proprietaire, false),
            AccountMeta::new(c.actif_du_destinataire, false),
            AccountMeta::new_readonly(c.administration, false),
            AccountMeta::new(c.marche, false),
            AccountMeta::new_readonly(c.actif, false),
            AccountMeta::new(c.jeton_de_recu, false),
            AccountMeta::new(c.reserves_de_liquidite, false),
            AccountMeta::new(c.position_de_liquidite, false),
            AccountMeta::new_readonly(c.modele_de_taux, false),
            AccountMeta::new(c.coffre_de_la_venue, false),
            AccountMeta::new(c.compte_de_reclamation, false),
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

/// Rachete `parts` jetons de recu contre AU MOINS `actif_minimal` unites.
///
/// LIBELLE EN PARTS LA OU LE RETRAIT EST LIBELLE EN ACTIF, et c'est ce qui rend
/// le chemin d'urgence possible. « Sortir tout » se dit ici « bruler tout mon
/// solde », sans avoir a connaitre la valeur exacte de la position ; demande en
/// actif, la meme sortie laisserait un reliquat ou echouerait sur un arrondi.
///
/// SES COMPTES SONT EXACTEMENT CEUX DU RETRAIT, verifie dans l'IDL le 04/08,
/// drapeaux compris. C'est la seule liste partagee de ce module, et elle l'est
/// parce que l'IDL les declare identiques, pas parce qu'elles se ressemblent.
pub fn instruction_rachat(
    programme: Pubkey,
    c: &ComptesRetrait,
    parts: u64,
    actif_minimal: u64,
) -> Instruction {
    let mut data = DISCRIMINATEUR_RACHAT.to_vec();
    data.extend_from_slice(&parts.to_le_bytes());
    data.extend_from_slice(&actif_minimal.to_le_bytes());

    Instruction {
        data,
        ..instruction_retrait(programme, c, 0, 0)
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
        let ix = instruction_depot(cle(99), &comptes_depot(), 1, 1);
        assert_eq!(ix.accounts.len(), 17);
        for (rang, meta) in ix.accounts.iter().enumerate() {
            assert_eq!(meta.pubkey, cle(rang as u8 + 1));
        }
    }

    /// Un compte declare en lecture seule alors qu'il doit etre ecrit fait
    /// echouer la transaction a l'execution, sans rien nommer d'utile.
    #[test]
    fn le_depot_declare_les_bons_droits_d_ecriture() {
        let ix = instruction_depot(cle(99), &comptes_depot(), 1, 1);
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
        let ix = instruction_depot(cle(99), &comptes_depot(), 1, 1);
        let signataires: Vec<usize> = ix
            .accounts
            .iter()
            .enumerate()
            .filter(|(_, m)| m.is_signer)
            .map(|(i, _)| i)
            .collect();
        assert_eq!(signataires, vec![0]);
    }

    /// L'ORDRE DES DEUX ARGUMENTS EST CELUI DE L'IDL, `assets` puis
    /// `minAmountOut`. Les intervertir ne casserait ni la compilation ni la
    /// taille de la charge utile : le depot demanderait le montant en plancher
    /// et le plancher en montant, ce qui echouerait tres loin d'ici.
    #[test]
    fn le_depot_encode_son_montant_puis_son_plancher_en_petit_boutiste() {
        let ix = instruction_depot(cle(99), &comptes_depot(), 500_000, 494_904);
        assert_eq!(ix.data[0..8], DISCRIMINATEUR_DEPOT);
        assert_eq!(ix.data.len(), 24);
        assert_eq!(&ix.data[8..16], &500_000u64.to_le_bytes());
        assert_eq!(&ix.data[16..24], &494_904u64.to_le_bytes());
    }

    #[test]
    fn le_depot_vise_le_programme_qu_on_lui_donne() {
        let ix = instruction_depot(cle(99), &comptes_depot(), 1, 1);
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
        let depot = instruction_depot(cle(99), &d, 1, 1);
        let rafraichir = instruction_rafraichir(cle(99), &r);
        let du_depot: Vec<Pubkey> = depot.accounts.iter().map(|m| m.pubkey).collect();
        assert!(rafraichir
            .accounts
            .iter()
            .all(|m| du_depot.contains(&m.pubkey)));
    }

    fn comptes_retrait() -> ComptesRetrait {
        ComptesRetrait {
            signataire: cle(1),
            recu_du_proprietaire: cle(2),
            actif_du_destinataire: cle(3),
            administration: cle(4),
            marche: cle(5),
            actif: cle(6),
            jeton_de_recu: cle(7),
            reserves_de_liquidite: cle(8),
            position_de_liquidite: cle(9),
            modele_de_taux: cle(10),
            coffre_de_la_venue: cle(11),
            compte_de_reclamation: cle(12),
            liquidite: cle(13),
            programme_de_liquidite: cle(14),
            modele_de_recompenses: cle(15),
            programme_de_jeton: cle(16),
            programme_de_compte_associe: cle(17),
            programme_systeme: cle(18),
        }
    }

    /// Le jumeau du test qui porte le depot. Dix-huit rangs, tous verifies.
    #[test]
    fn le_retrait_place_ses_dix_huit_comptes_dans_l_ordre_de_l_idl() {
        let ix = instruction_retrait(cle(99), &comptes_retrait(), 1, 1);
        assert_eq!(ix.accounts.len(), 18);
        for (rang, meta) in ix.accounts.iter().enumerate() {
            assert_eq!(meta.pubkey, cle(rang as u8 + 1));
        }
    }

    #[test]
    fn le_retrait_declare_les_bons_droits_d_ecriture() {
        let ix = instruction_retrait(cle(99), &comptes_retrait(), 1, 1);
        let en_ecriture: Vec<usize> = ix
            .accounts
            .iter()
            .enumerate()
            .filter(|(_, m)| m.is_writable)
            .map(|(i, _)| i + 1)
            .collect();
        assert_eq!(en_ecriture, vec![1, 2, 3, 5, 7, 8, 9, 11, 12, 13, 14]);
    }

    #[test]
    fn le_retrait_n_attend_qu_un_signataire() {
        let ix = instruction_retrait(cle(99), &comptes_retrait(), 1, 1);
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
    fn le_retrait_encode_son_montant_puis_son_plafond_en_petit_boutiste() {
        let ix = instruction_retrait(cle(99), &comptes_retrait(), 500_000, 494_904);
        assert_eq!(ix.data[0..8], DISCRIMINATEUR_RETRAIT);
        assert_eq!(ix.data.len(), 24);
        assert_eq!(&ix.data[8..16], &500_000u64.to_le_bytes());
        assert_eq!(&ix.data[16..24], &494_904u64.to_le_bytes());
    }

    #[test]
    fn le_retrait_vise_le_programme_qu_on_lui_donne() {
        let ix = instruction_retrait(cle(99), &comptes_retrait(), 1, 1);
        assert_eq!(ix.program_id, cle(99));
    }

    /// LE TEST QUI JUSTIFIE DE NE RIEN PARTAGER entre les deux listes. Nourris
    /// des MEMES trois comptes, le depot et le retrait ne les rangent pas
    /// pareil : les rangs quatre a six TOURNENT d'un cran, ils ne s'echangent
    /// pas deux a deux. Ecrit avec des cles distinctes de celles des jeux
    /// ci-dessus, pour qu'une confusion de rang ne puisse pas tomber juste par
    /// coincidence de valeur.
    #[test]
    fn le_retrait_ne_reprend_pas_l_ordre_du_depot() {
        let actif = cle(201);
        let administration = cle(202);
        let marche = cle(203);

        let mut d = comptes_depot();
        d.actif = actif;
        d.administration = administration;
        d.marche = marche;
        let depot = instruction_depot(cle(99), &d, 1, 1);

        let mut r = comptes_retrait();
        r.actif = actif;
        r.administration = administration;
        r.marche = marche;
        let retrait = instruction_retrait(cle(99), &r, 1, 1);

        // Rangs quatre, cinq et six, comptes a partir de un.
        assert_eq!(depot.accounts[3].pubkey, actif);
        assert_eq!(depot.accounts[4].pubkey, administration);
        assert_eq!(depot.accounts[5].pubkey, marche);

        assert_eq!(retrait.accounts[3].pubkey, administration);
        assert_eq!(retrait.accounts[4].pubkey, marche);
        assert_eq!(retrait.accounts[5].pubkey, actif);
    }

    /// Le rachat emprunte la liste du retrait, donc ce test verifie qu'il
    /// l'emprunte VRAIMENT : memes rangs, memes droits, meme signataire. Si
    /// l'un des deux derivait, le partage cesserait d'etre legitime.
    #[test]
    fn le_rachat_porte_exactement_les_comptes_du_retrait() {
        let c = comptes_retrait();
        let rachat = instruction_rachat(cle(99), &c, 1, 1);
        let retrait = instruction_retrait(cle(99), &c, 1, 1);
        assert_eq!(rachat.accounts, retrait.accounts);
        assert_eq!(rachat.program_id, retrait.program_id);
    }

    /// Mais SA CHARGE UTILE DIFFERE, et c'est tout l'objet : un discriminateur
    /// distinct, et deux arguments qui ne veulent pas dire la meme chose.
    #[test]
    fn le_rachat_encode_ses_parts_puis_son_plancher_en_petit_boutiste() {
        let ix = instruction_rachat(cle(99), &comptes_retrait(), 989_806, 999_998);
        assert_eq!(ix.data[0..8], DISCRIMINATEUR_RACHAT);
        assert_ne!(ix.data[0..8], DISCRIMINATEUR_RETRAIT);
        assert_eq!(ix.data.len(), 24);
        assert_eq!(&ix.data[8..16], &989_806u64.to_le_bytes());
        assert_eq!(&ix.data[16..24], &999_998u64.to_le_bytes());
    }

    /// LES VARIANTES NUES SONT UNE FAUTE ICI, pas une alternative. Leurs
    /// discriminateurs sont figes comme valeurs INTERDITES : retomber sur
    /// `deposit` ou `withdraw` retirerait la borne de la charge utile sans
    /// toucher a un seul compte, donc sans que rien d'autre ne s'en apercoive.
    #[test]
    fn aucune_instruction_ne_retombe_sur_la_variante_non_bornee() {
        const DEPOT_NU: [u8; 8] = [242, 35, 198, 137, 82, 225, 242, 182];
        const RETRAIT_NU: [u8; 8] = [183, 18, 70, 156, 148, 109, 161, 34];
        const RACHAT_NU: [u8; 8] = [184, 12, 86, 149, 70, 196, 97, 225];
        assert_ne!(DISCRIMINATEUR_DEPOT, DEPOT_NU);
        assert_ne!(DISCRIMINATEUR_RETRAIT, RETRAIT_NU);
        assert_ne!(DISCRIMINATEUR_RACHAT, RACHAT_NU);
    }
}
