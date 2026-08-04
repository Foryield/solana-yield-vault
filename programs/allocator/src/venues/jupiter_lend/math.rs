//! Arithmetique de la venue de pret Jupiter Lend. Fonctions PURES.
//!
//! Meme posture que `programs/yield-vault/src/math.rs` : c'est le seul endroit
//! de cette venue qu'un instrument de couverture sait mesurer (verdict S2), et
//! c'est celui ou un defaut coute des fonds.
//!
//! CE MODULE REIMPLEMENTE L'ARITHMETIQUE D'UN TIERS, et c'est assume. Le
//! programme de pret ne dit pas a l'avance combien de parts il emettra : la
//! seule facon de verifier ce qu'il a rendu est de savoir ce qu'on attendait.
//! Le prix de cette connaissance est une dependance a leur arrondi, bornee par
//! la decision du plan : on exige un PLANCHER, pas une egalite.

/// Precision des prix d'echange du protocole. Constante de l'editeur, nommee
/// `EXCHANGE_PRICES_PRECISION` chez lui, reprise telle quelle par
/// l'integration de reference.
pub const PRECISION_DES_PRIX: u128 = 1_000_000_000_000;

/// Echecs de l'arithmetique de la venue. Types plutot qu'anonymes : un client
/// hors chaine teste un code, pas une chaine de panique.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum VenueError {
    /// Depot d'un montant nul.
    MontantNul,
    /// Un prix d'echange vaut zero : le marche n'est pas initialise, ou son
    /// compte a ete mal decode. Diviser par lui rendrait un resultat absurde.
    PrixNul,
    /// Le resultat ne tient pas dans un u64.
    Debordement,
    /// La venue a rendu moins de parts que la conversion n'en promettait.
    PartsInsuffisantes,
}

/// Parts de recu attendues pour un depot de `actif` unites.
///
/// LA CONVERSION SE FAIT EN DEUX TEMPS, AVEC UN ARRONDI INTERMEDIAIRE, et ce
/// n'est pas une precaution de style :
///
/// ```text
/// brut   = plancher(actif x P / prix_liquidite)
/// normal = plancher(brut x prix_liquidite / P)
/// parts  = plancher(normal x P / prix_jeton)
/// ```
///
/// Mesure le 02/08 contre les prix reels du marche USDC devnet : la
/// simplification en une seule division diverge de cette suite dans 99,64 %
/// des cas sur les deux millions de montants testes, et toujours vers le HAUT.
/// Employee avec le plancher exige ci-dessous, elle ferait donc rejeter la
/// quasi-totalite des depots.
///
/// Les deux prix sont necessaires, et ils ne sont pas interchangeables : le
/// premier appartient a la couche de liquidite, le second au jeton de recu.
/// L'integration de reference met explicitement en garde contre leur confusion,
/// qui ne leve aucune erreur et fausse la valorisation en silence.
pub fn parts_attendues_pour_depot(
    actif: u64,
    prix_liquidite: u64,
    prix_jeton: u64,
) -> Result<u64, VenueError> {
    if actif == 0 {
        return Err(VenueError::MontantNul);
    }
    if prix_liquidite == 0 || prix_jeton == 0 {
        return Err(VenueError::PrixNul);
    }

    let liquidite = prix_liquidite as u128;
    let jeton = prix_jeton as u128;

    // AUCUNE DE CES TROIS MULTIPLICATIONS NE PEUT DEBORDER, et c'est demontre
    // plutot que suppose : `actif` tient dans un u64, donc au plus 1,85e19 ;
    // multiplie par la precision 1e12, au plus 1,85e31, quand un u128 en porte
    // 3,4e38. `brut x liquidite` ne depasse pas `actif x P` par construction,
    // puisque `brut` est ce produit divise par `liquidite`. Et `normal` ne
    // depasse jamais `actif`, donc son produit par la precision est borne de la
    // meme facon. Des gardes ici seraient du code mort, que rien ne pourrait
    // exercer et que la couverture signalerait a juste titre.
    let brut = (actif as u128) * PRECISION_DES_PRIX / liquidite;
    let normal = brut * liquidite / PRECISION_DES_PRIX;
    let parts = normal * PRECISION_DES_PRIX / jeton;

    // LE SEUL DEBORDEMENT REELLEMENT ATTEIGNABLE. Il demande un prix de jeton
    // tres inferieur a la precision, ce qui n'arrive pas sur un marche sain
    // mais arriverait sur un compte mal decode : on refuse plutot que de
    // tronquer un nombre de parts.
    u64::try_from(parts).map_err(|_| VenueError::Debordement)
}

/// Valeur en unites d'actif d'un solde de jetons de recu.
///
/// C'EST LE PRIX DU JETON DE RECU QU'IL FAUT, PAS CELUI DE LA LIQUIDITE. Les
/// deux vivent dans le meme compte et se ressemblent a la troisieme decimale
/// pres ; seul le premier inclut les recompenses accumulees. Les confondre ne
/// leve aucune erreur, cela sous-evalue la position d'exactement ce qu'elle a
/// gagne, ce qui est la faute la plus difficile a voir de toute cette venue.
///
/// SERT AU PLAFOND DE PROTOCOLE, qui borne la valorisation et non le cumul
/// depose : une position peut croitre bien au-dela de ce qu'on y a mis, par les
/// seuls interets, et c'est cette croissance-la qu'un plafond doit voir.
///
/// Le prix doit avoir ete RAFRAICHI dans la meme transaction, sans quoi la
/// valeur rendue est celle d'un marche perime.
pub fn valeur_en_actif(parts: u64, prix_jeton: u64) -> Result<u64, VenueError> {
    if prix_jeton == 0 {
        return Err(VenueError::PrixNul);
    }
    // Aucun debordement possible : `parts` tient dans un u64, donc au plus
    // 1,85e19, et le produit par un prix du meme ordre reste sous 3,4e38, la
    // borne du u128. La division par la precision ramene ensuite le resultat
    // sous `parts` multiplie par le prix rapporte a 1e12.
    let valeur = (parts as u128) * (prix_jeton as u128) / PRECISION_DES_PRIX;
    u64::try_from(valeur).map_err(|_| VenueError::Debordement)
}

/// Ecart entre ce que la venue a reellement emis et ce qu'on attendait.
///
/// DECISION DU PLAN, ET ELLE S'ECARTE DE L'INTEGRATION DE REFERENCE. Celle-ci
/// exige l'egalite stricte ; nous exigeons un plancher. Le raisonnement : une
/// egalite stricte transforme un simple changement d'arrondi chez le tiers en
/// panne totale du coffre, alors que rien n'aurait ete vole. Le plancher garde
/// la seule protection qui compte, celle contre un versement insuffisant.
///
/// L'ecart favorable est rendu plutot que tu : il ne justifie pas d'annuler,
/// mais il signale que leur arithmetique a bouge, et l'appelant le journalise.
pub fn verifier_plancher(recues: u64, attendues: u64) -> Result<u64, VenueError> {
    if recues < attendues {
        return Err(VenueError::PartsInsuffisantes);
    }
    Ok(recues - attendues)
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    /// Prix reels du marche USDC devnet, lus le 2026-08-02. Une arithmetique
    /// eprouvee sur des valeurs inventees ne prouve rien du marche vise.
    const LIQ: u64 = 1_010_294_432_661;
    const JETON: u64 = 1_010_294_428_971;

    #[test]
    fn reproduit_les_valeurs_du_marche_reel() {
        // Calcules independamment depuis les prix ci-dessus, puis figes ici :
        // si l'implementation derive, ces valeurs le disent.
        assert_eq!(parts_attendues_pour_depot(1_000, LIQ, JETON), Ok(988));
        assert_eq!(parts_attendues_pour_depot(500_000, LIQ, JETON), Ok(494_904));
        assert_eq!(
            parts_attendues_pour_depot(1_000_000, LIQ, JETON),
            Ok(989_809)
        );
        assert_eq!(
            parts_attendues_pour_depot(1_000_000_000, LIQ, JETON),
            Ok(989_810_465)
        );
    }

    /// LE TEMOIN QUI COMPTE. La simplification en une division est la faute
    /// naturelle, et sur ces quatre montants elle rend exactement une unite de
    /// plus. Ecrire l'ecart exact plutot qu'une inegalite fait de ce test un
    /// detecteur, et pas seulement un garde-fou.
    ///
    /// Pas de message d'assertion formate ici, ni ailleurs dans ce module : il
    /// ne s'evalue qu'en cas d'echec, donc il compte comme une ligne jamais
    /// couverte, et le seuil de ce depot est a cent pour cent.
    #[test]
    fn ne_se_confond_pas_avec_la_simplification_en_une_division() {
        for actif in [1_000u64, 500_000, 1_000_000, 1_000_000_000] {
            let simplifiee = (actif as u128 * PRECISION_DES_PRIX / JETON as u128) as u64;
            let vraie = parts_attendues_pour_depot(actif, LIQ, JETON).unwrap();
            assert_eq!(vraie + 1, simplifiee);
        }
    }

    #[test]
    fn un_montant_nul_est_refuse() {
        assert_eq!(
            parts_attendues_pour_depot(0, LIQ, JETON),
            Err(VenueError::MontantNul)
        );
    }

    /// Un prix nul signale un marche non initialise ou un compte mal decode.
    /// Continuer rendrait un resultat absurde presente comme une valorisation.
    #[test]
    fn un_prix_nul_est_refuse() {
        assert_eq!(
            parts_attendues_pour_depot(1_000, 0, JETON),
            Err(VenueError::PrixNul)
        );
        assert_eq!(
            parts_attendues_pour_depot(1_000, LIQ, 0),
            Err(VenueError::PrixNul)
        );
    }

    /// Ce test avait ete ecrit depuis une attente et non depuis un calcul : il
    /// supposait qu'un montant maximal deborde, alors qu'il tient. Le vrai
    /// debordement demande un prix de jeton tres inferieur a la precision,
    /// c'est-a-dire un compte mal decode.
    #[test]
    fn un_prix_de_jeton_absurde_deborde_plutot_que_de_tronquer() {
        assert_eq!(
            parts_attendues_pour_depot(u64::MAX, 1, 1),
            Err(VenueError::Debordement)
        );
    }

    /// La contre-epreuve du precedent : un montant maximal sur des prix sains
    /// ne deborde PAS. Sans elle, la garde ci-dessus pourrait refuser des
    /// depots legitimes sans que rien ne le signale.
    #[test]
    fn un_montant_maximal_sur_des_prix_sains_ne_deborde_pas() {
        assert!(parts_attendues_pour_depot(u64::MAX, LIQ, JETON).is_ok());
    }

    /// Valorisation d'un solde reel : les 1 979 614 jetons de recu emis par le
    /// premier depot devnet du 04/08, au prix du jeton mesure ce jour-la.
    ///
    /// LA VALEUR EST CALCULEE, PAS ATTENDUE, et la nuance a mordu : une
    /// premiere redaction posait 2 000 000, le montant depose, en supposant un
    /// aller-retour exact. Il rend 1 999 999. L'unite manquante est l'arrondi
    /// vers le bas de la conversion, et elle est structurelle : un depot suivi
    /// d'une valorisation ne rend jamais tout a fait ce qu'on a mis.
    ///
    /// CONSEQUENCE POUR LE PLAFOND, et c'est pour cela que ce test existe :
    /// valoriser rend SYSTEMATIQUEMENT un peu moins que le cumul depose, donc
    /// un plafond pose sur la valorisation ne se declenche jamais par le seul
    /// effet d'un arrondi. Il ne mord que sur des interets reellement acquis.
    #[test]
    fn valorise_un_solde_reel_de_jetons_de_recu() {
        assert_eq!(valeur_en_actif(1_979_614, 1_010_297_649_056), Ok(1_999_999));
    }

    /// Le solde reste apres le retrait devnet du 04/08, valorise au meme prix.
    #[test]
    fn valorise_le_solde_restant_apres_un_retrait_partiel() {
        assert_eq!(valeur_en_actif(989_806, 1_010_297_649_056), Ok(999_998));
    }

    /// LE TEMOIN QUI COMPTE ICI. Employer le prix de la liquidite a la place de
    /// celui du jeton sous-evalue la position, silencieusement. Sur les prix
    /// reels du marche, l'ecart existe et se mesure : ce test le fige, pour
    /// qu'un echange des deux arguments ne passe pas inapercu.
    #[test]
    fn le_prix_de_la_liquidite_ne_donne_pas_la_meme_valeur() {
        let avec_jeton = valeur_en_actif(1_000_000_000, JETON).unwrap();
        let avec_liquidite = valeur_en_actif(1_000_000_000, LIQ).unwrap();
        assert_ne!(avec_jeton, avec_liquidite);
    }

    #[test]
    fn une_position_vide_ne_vaut_rien() {
        assert_eq!(valeur_en_actif(0, JETON), Ok(0));
    }

    /// Un prix nul signale un marche non initialise ou un compte mal decode :
    /// rendre zero laisserait croire a une position vide, ce qui autoriserait
    /// un depot que le plafond aurait du refuser.
    #[test]
    fn valoriser_a_prix_nul_est_refuse() {
        assert_eq!(valeur_en_actif(1_000, 0), Err(VenueError::PrixNul));
    }

    #[test]
    fn une_valorisation_qui_deborde_est_refusee() {
        assert_eq!(
            valeur_en_actif(u64::MAX, u64::MAX),
            Err(VenueError::Debordement)
        );
    }

    #[test]
    fn le_plancher_refuse_un_versement_insuffisant() {
        assert_eq!(
            verifier_plancher(99, 100),
            Err(VenueError::PartsInsuffisantes)
        );
        assert_eq!(verifier_plancher(100, 100), Ok(0));
        assert_eq!(verifier_plancher(101, 100), Ok(1));
    }

    proptest! {
        /// Deposer plus ne peut jamais rendre moins de parts.
        #[test]
        fn la_conversion_est_croissante(a in 1u64..1_000_000_000, b in 1u64..1_000_000_000) {
            let (petit, grand) = if a <= b { (a, b) } else { (b, a) };
            let pp = parts_attendues_pour_depot(petit, LIQ, JETON).unwrap();
            let pg = parts_attendues_pour_depot(grand, LIQ, JETON).unwrap();
            prop_assert!(pp <= pg);
        }

        /// La conversion ne depasse JAMAIS la simplification : c'est la borne
        /// qui garantit qu'un plancher fonde sur elle reste atteignable.
        #[test]
        fn la_conversion_ne_depasse_jamais_la_simplification(actif in 1u64..1_000_000_000_000) {
            let vraie = parts_attendues_pour_depot(actif, LIQ, JETON).unwrap();
            let simplifiee = (actif as u128 * PRECISION_DES_PRIX / JETON as u128) as u64;
            prop_assert!(vraie <= simplifiee);
        }

        /// Aucune combinaison de montant et de prix ne doit paniquer : sur un
        /// programme, une panique est une transaction annulee sans motif.
        #[test]
        fn ne_panique_sur_aucune_entree(
            actif in any::<u64>(),
            liquidite in any::<u64>(),
            jeton in any::<u64>(),
        ) {
            let _ = parts_attendues_pour_depot(actif, liquidite, jeton);
        }
    }
}
