//! Lecture du compte de marche de Jupiter Lend. Fonction PURE.
//!
//! Ce module decode des octets. Il ne connait ni Anchor ni le reseau, ce qui le
//! rend mesurable par la couverture et epprouvable sur des octets reels.
//!
//! LA DISPOSITION EST ETABLIE PAR TROIS SOURCES CONCORDANTES, et non par
//! decodage positionnel : l'IDL publie par l'editeur, les octets lus sur devnet,
//! et la structure declaree par l'integration de reference. Les trois donnent le
//! meme ordre et le meme discriminateur, et la somme des tailles rend exactement
//! les 196 octets observes.
//!
//! Le compte est declare sans remplissage cote editeur : une cle publique
//! s'aligne sur un octet quand un entier de huit octets s'aligne sur huit, donc
//! un alignement naturel insererait des octets fantomes avant le premier prix.
//! Les decalages ci-dessous sont donc contigus, et c'est verifie par la taille.

/// Discriminateur du compte `Lending`, declare par l'IDL et retrouve sur les
/// quatre comptes de marche lus sur devnet le 02/08.
pub const DISCRIMINATEUR_LENDING: [u8; 8] = [135, 199, 82, 16, 249, 131, 182, 241];

/// Taille exacte du compte. Sert de controle : une disposition fausse ne tombe
/// pas juste par hasard.
pub const TAILLE_LENDING: usize = 196;

/// Echecs de lecture d'un compte de marche.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum LectureError {
    /// Le compte n'a pas la taille attendue : ce n'est pas un marche, ou la
    /// disposition a change chez l'editeur.
    TailleInattendue,
    /// Le compte porte un autre discriminateur : c'est un compte d'un autre
    /// type du meme programme, ou d'un autre programme.
    DiscriminateurInattendu,
}

/// Ce que le marche porte et dont l'allocateur a besoin.
///
/// Volontairement PARTIEL : les champs non utilises ne sont pas exposes, pour
/// qu'aucun appelant ne s'appuie sur une valeur que nous n'eprouvons pas.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub struct Marche {
    /// Actif sous-jacent du marche.
    pub actif: [u8; 32],
    /// Mint du jeton de recu emis contre un depot.
    pub jeton_de_recu: [u8; 32],
    /// Decimales du jeton de recu. Identiques a celles de l'actif, l'editeur
    /// le documente et les quatre marches devnet le confirment.
    pub decimales: u8,
    /// Prix de la couche de liquidite. N'inclut PAS les recompenses.
    pub prix_liquidite: u64,
    /// Prix du jeton de recu, recompenses comprises. C'EST CELUI QUI VALORISE
    /// UNE POSITION ; l'autre lui ressemble et le confondre fausse le calcul
    /// sans lever d'erreur.
    pub prix_jeton: u64,
    /// Horodatage du dernier rafraichissement des prix. Un marche peu actif
    /// peut etre tres en retard : le notre l'etait de cinq jours le 02/08.
    pub dernier_rafraichissement: u64,
}

/// Decode un compte de marche.
///
/// Refuse plutot que d'interpreter : un compte de la mauvaise taille ou du
/// mauvais type rendrait des prix absurdes presentes comme une valorisation.
pub fn lire_marche(donnees: &[u8]) -> Result<Marche, LectureError> {
    if donnees.len() != TAILLE_LENDING {
        return Err(LectureError::TailleInattendue);
    }
    if donnees[0..8] != DISCRIMINATEUR_LENDING {
        return Err(LectureError::DiscriminateurInattendu);
    }

    let cle = |debut: usize| -> [u8; 32] {
        let mut c = [0u8; 32];
        c.copy_from_slice(&donnees[debut..debut + 32]);
        c
    };
    let entier = |debut: usize| -> u64 {
        let mut o = [0u8; 8];
        o.copy_from_slice(&donnees[debut..debut + 8]);
        u64::from_le_bytes(o)
    };

    Ok(Marche {
        actif: cle(8),
        jeton_de_recu: cle(40),
        // 72..74 : identifiant du marche, non expose.
        decimales: donnees[74],
        // 75..107 : modele de taux de recompenses, non expose.
        prix_liquidite: entier(107),
        prix_jeton: entier(115),
        dernier_rafraichissement: entier(123),
    })
}

/// Le marche a-t-il ete rafraichi a cet instant precis ?
///
/// PURE ET NON BRANCHEE SUR L'HORLOGE, deliberement : la lire ici rendrait cette
/// regle intestable hors chaine, et le seuil de couverture de ce depot la
/// signalerait a juste titre. Le gestionnaire lit l'horloge, cette fonction
/// tranche.
///
/// EGALITE STRICTE, alors que ce dessin refuse l'egalite stricte partout
/// ailleurs face a un tiers. La difference est de nature. Les bornes de sortie
/// comparent le resultat d'une ARITHMETIQUE, sujette a un changement d'arrondi
/// qui ne vole rien ; ici on verifie un FAIT BINAIRE, « le rafraichissement que
/// nous venons d'invoquer a-t-il pris effet ». Un fait ne derive pas d'une
/// unite.
///
/// MESURE AVANT D'ETRE EXIGE. L'etape 1 se contentait de journaliser cet
/// horodatage, faute de savoir comment la venue le posait ; les deux
/// transactions devnet du 04/08 ont montre qu'il tombe exactement sur l'horloge
/// de la transaction.
pub fn est_frais(marche: &Marche, maintenant: i64) -> bool {
    i64::try_from(marche.dernier_rafraichissement).is_ok_and(|t| t == maintenant)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// LES OCTETS REELS du marche USDC devnet
    /// `98Uy7eonumvRbhQvP5Jt7B3WjNqpndioMF99xvR7sDVa`, lus le 2026-08-02.
    ///
    /// Une disposition eprouvee sur des octets fabriques ne prouve rien : elle
    /// ne ferait que confirmer ce qu'on a suppose en les fabriquant.
    const MARCHE_USDC: [u8; 196] = [
        135, 199, 82, 16, 249, 131, 182, 241, 59, 68, 44, 179, 145, 33, 87, 241, 58, 147, 61, 1,
        52, 40, 45, 3, 43, 95, 254, 205, 1, 162, 219, 241, 183, 121, 6, 8, 223, 0, 46, 167, 22,
        135, 188, 131, 188, 100, 111, 21, 25, 234, 69, 222, 11, 192, 138, 84, 166, 60, 186, 48,
        185, 155, 176, 37, 39, 27, 141, 116, 145, 220, 228, 242, 2, 0, 6, 226, 241, 167, 253, 50,
        38, 228, 71, 164, 146, 224, 44, 211, 84, 114, 22, 72, 237, 98, 21, 71, 171, 82, 44, 28, 18,
        195, 39, 114, 177, 89, 101, 149, 163, 61, 58, 235, 0, 0, 0, 43, 149, 61, 58, 235, 0, 0, 0,
        136, 59, 104, 106, 0, 0, 0, 0, 75, 18, 214, 7, 162, 213, 169, 31, 250, 155, 116, 144, 230,
        134, 169, 162, 140, 108, 186, 160, 124, 113, 171, 33, 65, 26, 223, 206, 254, 228, 62, 48,
        149, 174, 153, 209, 16, 34, 217, 161, 171, 250, 126, 62, 174, 176, 108, 62, 153, 134, 98,
        58, 28, 16, 179, 182, 4, 2, 237, 105, 229, 188, 240, 58, 253,
    ];

    /// Cle publique de l'USDC devnet de Circle,
    /// `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`, en octets.
    const USDC: [u8; 32] = [
        59, 68, 44, 179, 145, 33, 87, 241, 58, 147, 61, 1, 52, 40, 45, 3, 43, 95, 254, 205, 1, 162,
        219, 241, 183, 121, 6, 8, 223, 0, 46, 167,
    ];

    #[test]
    fn lit_le_marche_reel_de_devnet() {
        let m = lire_marche(&MARCHE_USDC).unwrap();
        assert_eq!(m.actif, USDC);
        assert_eq!(m.decimales, 6);
        // Prix mesures independamment par lecture RPC le meme jour.
        assert_eq!(m.prix_liquidite, 1_010_294_432_661);
        assert_eq!(m.prix_jeton, 1_010_294_428_971);
    }

    /// Les deux prix se ressemblent au point que le guide de reference met en
    /// garde contre leur confusion. Ce test fige le fait qu'ils DIFFERENT sur
    /// un marche reel : un decodage qui les melangerait passerait inapercu si
    /// on ne le verifiait pas.
    #[test]
    fn les_deux_prix_ne_sont_pas_le_meme_champ() {
        let m = lire_marche(&MARCHE_USDC).unwrap();
        assert_ne!(m.prix_liquidite, m.prix_jeton);
    }

    /// Le marche etait reste cinq jours sans rafraichissement quand ces octets
    /// ont ete lus, et c'est le fait qui justifie d'appeler `updateRate` avant
    /// tout calcul. La valeur est CALCULEE depuis les octets, pas devinee : une
    /// premiere redaction avait pose une constante approximative, et le test
    /// l'a rejetee.
    #[test]
    fn porte_l_horodatage_du_dernier_rafraichissement() {
        let m = lire_marche(&MARCHE_USDC).unwrap();
        // 1785215880 = 28 juillet 2026 a 05:18 UTC, cinq jours avant la lecture.
        assert_eq!(m.dernier_rafraichissement, 1_785_215_880);
    }

    /// Le jeton de recu est un mint distinct de l'actif. Les confondre
    /// derivierait des comptes qui n'existent pas.
    #[test]
    fn le_jeton_de_recu_n_est_pas_l_actif() {
        let m = lire_marche(&MARCHE_USDC).unwrap();
        assert_ne!(m.actif, m.jeton_de_recu);
    }

    /// Les valeurs viennent du marche reel : l'horodatage lu le 02/08, cinq
    /// jours perime, et celui du premier depot devnet du 04/08, qui tombait
    /// exactement sur l'horloge de sa transaction.
    #[test]
    fn ne_reconnait_frais_qu_un_marche_rafraichi_a_l_instant_meme() {
        let mut m = lire_marche(&MARCHE_USDC).unwrap();
        assert!(!est_frais(&m, 1_785_853_332));

        m.dernier_rafraichissement = 1_785_853_332;
        assert!(est_frais(&m, 1_785_853_332));
        // Une seconde d'ecart suffit a le declarer perime : c'est un fait
        // binaire, pas une tolerance.
        assert!(!est_frais(&m, 1_785_853_333));
        assert!(!est_frais(&m, 1_785_853_331));
    }

    /// Un horodatage qui ne tient pas dans un entier signe ne peut pas etre
    /// egal a une horloge : le refuser vaut mieux que le tronquer.
    #[test]
    fn un_horodatage_hors_bornes_n_est_jamais_frais() {
        let mut m = lire_marche(&MARCHE_USDC).unwrap();
        m.dernier_rafraichissement = u64::MAX;
        assert!(!est_frais(&m, i64::MAX));
    }

    #[test]
    fn refuse_une_taille_inattendue() {
        assert_eq!(
            lire_marche(&MARCHE_USDC[..195]),
            Err(LectureError::TailleInattendue)
        );
    }

    /// Un compte du meme programme mais d'un autre type a la bonne taille par
    /// hasard ? Le discriminateur tranche.
    #[test]
    fn refuse_un_autre_discriminateur() {
        let mut faux = MARCHE_USDC;
        faux[0] = 0;
        assert_eq!(
            lire_marche(&faux),
            Err(LectureError::DiscriminateurInattendu)
        );
    }
}
