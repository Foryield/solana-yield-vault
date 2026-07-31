//! Arithmetique du coffre. Fonctions PURES, sans dependance a Anchor.
//!
//! Ce module est le seul endroit du programme qu'un instrument de couverture
//! sait mesurer (cf. verdict S2 : le chemin BPF rend zero pour cent). C'est
//! aussi celui ou un defaut coute des fonds. Les gestionnaires d'instruction ne
//! rejouent aucune arithmetique : ils lisent, appellent ici, ecrivent.
//!
//! Invariants portes depuis la version Soroban, ou une revue y avait trouve un
//! defaut critique de genese. Ils sont transcrits, pas rediscutes.

/// Parts mortes verrouillees au premier depot, jamais rachetables : borne le
/// cout d'une attaque par inflation du prix de la premiere part (modele
/// Uniswap V2). En unites de 6 decimales, 1 000 = 0,001 actif.
pub const MINIMUM_LIQUIDITY: u64 = 1_000;

/// Echecs de l'arithmetique du coffre. Types plutot qu'anonymes : un client
/// hors chaine teste un code, pas une chaine de panique.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum MathError {
    /// Depot d'un montant nul.
    AmountMustBePositive,
    /// Depot de genese n'excedant pas les parts mortes, ou depot ordinaire
    /// tronquant a zero part.
    DepositTooSmall,
    /// Retrait d'un nombre de parts nul.
    SharesMustBePositive,
    /// Retrait portant sur plus de parts qu'il n'en existe.
    SharesExceedSupply,
    /// Retrait tronquant a zero unite d'actif.
    WithdrawTooSmall,
    /// Des parts existent mais le coffre ne detient plus aucun actif.
    VaultInsolvent,
    /// Le resultat ne tient pas dans un u64.
    MathOverflow,
}

/// Parts a emettre pour un depot. La genese en produit deux lots : celui du
/// deposant et les parts mortes. Les rendre separement evite que le
/// gestionnaire rejoue la soustraction.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub struct DepositShares {
    /// Parts creditees au deposant.
    pub to_depositor: u64,
    /// Parts mortes a verrouiller. Nul hors genese.
    pub dead: u64,
}

/// Parts emises pour un depot de `amount`, le coffre detenant `assets_before`
/// actifs pour `total_shares` parts AVANT le transfert entrant.
///
/// `parts = montant x total_parts / actifs_avant`, tronque : l'arrondi est
/// toujours en faveur des parts existantes.
pub fn shares_for_deposit(
    amount: u64,
    total_shares: u64,
    assets_before: u64,
) -> Result<DepositShares, MathError> {
    if amount == 0 {
        return Err(MathError::AmountMustBePositive);
    }

    if total_shares == 0 {
        // Genese : tout l'actif deja detenu, donation comprise, entre dans le
        // total. Sans quoi un donateur offrirait des parts au premier deposant.
        let genesis = u128::from(amount) + u128::from(assets_before);
        if genesis <= u128::from(MINIMUM_LIQUIDITY) {
            return Err(MathError::DepositTooSmall);
        }
        let to_depositor = genesis - u128::from(MINIMUM_LIQUIDITY);
        return Ok(DepositShares {
            to_depositor: u64::try_from(to_depositor).map_err(|_| MathError::MathOverflow)?,
            dead: MINIMUM_LIQUIDITY,
        });
    }

    // Des parts existent mais plus aucun actif : refuser plutot que diviser
    // par zero.
    if assets_before == 0 {
        return Err(MathError::VaultInsolvent);
    }

    // Elargissement en u128 pour le produit : son debordement n'est pas une
    // anomalie metier, c'est un artefact de largeur. Seul le RESULTAT doit
    // tenir dans un u64, puisqu'il devient un solde de jeton.
    let shares = u128::from(amount) * u128::from(total_shares) / u128::from(assets_before);
    if shares == 0 {
        return Err(MathError::DepositTooSmall);
    }
    Ok(DepositShares {
        to_depositor: u64::try_from(shares).map_err(|_| MathError::MathOverflow)?,
        dead: 0,
    })
}

/// Actif restitue pour `shares` parts detruites, le coffre detenant `assets`
/// actifs pour `total_shares` parts AVANT destruction.
///
/// `montant = parts x actifs / total_parts`, tronque : l'arrondi est toujours
/// en faveur des parts restantes.
pub fn assets_for_withdraw(shares: u64, total_shares: u64, assets: u64) -> Result<u64, MathError> {
    if shares == 0 {
        return Err(MathError::SharesMustBePositive);
    }
    // Couvre aussi le coffre sans parts : shares > 0 == total_shares.
    if shares > total_shares {
        return Err(MathError::SharesExceedSupply);
    }

    // total_shares >= shares > 0, donc le diviseur n'est jamais nul.
    let amount = u128::from(shares) * u128::from(assets) / u128::from(total_shares);
    if amount == 0 {
        return Err(MathError::WithdrawTooSmall);
    }
    // shares <= total_shares implique amount <= assets : le resultat tient
    // dans un u64 par construction, aucune borne a tester ici.
    Ok(amount as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- Depot : genese ---------------------------------------------------

    #[test]
    fn genese_verrouille_les_parts_mortes() {
        let out = shares_for_deposit(10_000, 0, 0).unwrap();
        assert_eq!(out.dead, MINIMUM_LIQUIDITY);
        assert_eq!(out.to_depositor, 10_000 - MINIMUM_LIQUIDITY);
    }

    #[test]
    fn genese_absorbe_une_donation_prealable() {
        // 5 000 deja detenus par donation, 5 000 deposes : le total de genese
        // vaut 10 000, sans quoi le donateur offrirait des parts au deposant.
        let out = shares_for_deposit(5_000, 0, 5_000).unwrap();
        assert_eq!(out.to_depositor + out.dead, 10_000);
        assert_eq!(out.dead, MINIMUM_LIQUIDITY);
    }

    #[test]
    fn genese_egale_aux_parts_mortes_refusee() {
        assert_eq!(
            shares_for_deposit(MINIMUM_LIQUIDITY, 0, 0),
            Err(MathError::DepositTooSmall)
        );
    }

    #[test]
    fn genese_d_une_unite_au_dessus_des_parts_mortes_acceptee() {
        let out = shares_for_deposit(MINIMUM_LIQUIDITY + 1, 0, 0).unwrap();
        assert_eq!(out.to_depositor, 1);
        assert_eq!(out.dead, MINIMUM_LIQUIDITY);
    }

    // --- Depot : pro-rata -------------------------------------------------

    #[test]
    fn pro_rata_tronque_en_faveur_du_coffre() {
        // 3 x 10 / 7 = 4,28... -> 4. Le reste profite aux parts existantes.
        let out = shares_for_deposit(3, 10, 7).unwrap();
        assert_eq!(out.to_depositor, 4);
        assert_eq!(out.dead, 0);
    }

    #[test]
    fn depot_tronquant_a_zero_part_refuse() {
        // 1 x 1 / 1 000 = 0 : encaisser sans contrepartie serait un vol.
        assert_eq!(
            shares_for_deposit(1, 1, 1_000),
            Err(MathError::DepositTooSmall)
        );
    }

    #[test]
    fn montant_nul_refuse() {
        assert_eq!(
            shares_for_deposit(0, 10, 10),
            Err(MathError::AmountMustBePositive)
        );
    }

    #[test]
    fn parts_existantes_sans_actif_refusees() {
        // Perte totale de strategie : refuser plutot que diviser par zero.
        assert_eq!(
            shares_for_deposit(100, 10, 0),
            Err(MathError::VaultInsolvent)
        );
    }

    #[test]
    fn produit_intermediaire_large_ne_deborde_pas() {
        // Le produit depasse u64 mais le resultat tient : l'elargissement en
        // u128 doit l'absorber au lieu de refuser un depot legitime.
        let out = shares_for_deposit(u64::MAX, u64::MAX, u64::MAX).unwrap();
        assert_eq!(out.to_depositor, u64::MAX);
    }

    #[test]
    fn resultat_hors_borne_u64_refuse() {
        // 2 x u64::MAX / 1 ne tient dans aucun u64.
        assert_eq!(
            shares_for_deposit(2, u64::MAX, 1),
            Err(MathError::MathOverflow)
        );
    }

    // --- Retrait ----------------------------------------------------------

    #[test]
    fn retrait_pro_rata_tronque_en_faveur_du_coffre() {
        // 3 x 7 / 10 = 2,1 -> 2. Le reste profite aux parts restantes.
        assert_eq!(assets_for_withdraw(3, 10, 7), Ok(2));
    }

    #[test]
    fn retrait_total_rend_tout_l_actif() {
        assert_eq!(assets_for_withdraw(10, 10, 7), Ok(7));
    }

    #[test]
    fn retrait_de_parts_nulles_refuse() {
        assert_eq!(
            assets_for_withdraw(0, 10, 10),
            Err(MathError::SharesMustBePositive)
        );
    }

    #[test]
    fn retrait_au_dela_de_l_offre_refuse() {
        assert_eq!(
            assets_for_withdraw(11, 10, 10),
            Err(MathError::SharesExceedSupply)
        );
    }

    #[test]
    fn retrait_sur_coffre_sans_parts_refuse() {
        assert_eq!(
            assets_for_withdraw(1, 0, 10),
            Err(MathError::SharesExceedSupply)
        );
    }

    #[test]
    fn retrait_tronquant_a_zero_refuse() {
        // 1 x 1 / 1 000 = 0 : detruire des parts pour rien.
        assert_eq!(
            assets_for_withdraw(1, 1_000, 1),
            Err(MathError::WithdrawTooSmall)
        );
    }

    #[test]
    fn retrait_sur_coffre_vide_refuse() {
        // Des parts existent, plus aucun actif : le retrait tronque a zero.
        assert_eq!(
            assets_for_withdraw(10, 10, 0),
            Err(MathError::WithdrawTooSmall)
        );
    }
}

#[cfg(test)]
mod props {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(2048))]

        /// INVARIANT DE SURETE, hors genese. Un aller-retour immediat ne peut
        /// jamais rendre plus que le montant depose. Si cette propriete tombe,
        /// un entrant ponctionne les porteurs deja en place : c'est la seule
        /// propriete dont la violation est une perte de fonds directe.
        ///
        /// La genese est traitee a part : elle a une raison legitime de rendre
        /// davantage, cf. la propriete suivante.
        #[test]
        fn hors_genese_l_aller_retour_ne_cree_jamais_de_valeur(
            amount in 1u64..,
            total_shares in 1u64..,
            assets_before in 0u64..,
        ) {
            let out = match shares_for_deposit(amount, total_shares, assets_before) {
                Ok(out) => out,
                Err(_) => return Ok(()),
            };

            // Les cas ou l'etat lui-meme deborde sont ecartes : ils sont hors
            // d'atteinte on-chain, l'offre d'un mint tenant dans un u64.
            let new_total = match total_shares.checked_add(out.to_depositor) {
                Some(t) => t,
                None => return Ok(()),
            };
            let new_assets = match assets_before.checked_add(amount) {
                Some(a) => a,
                None => return Ok(()),
            };

            if let Ok(back) = assets_for_withdraw(out.to_depositor, new_total, new_assets) {
                prop_assert!(
                    back <= amount,
                    "aller-retour rend {} pour un depot de {}",
                    back,
                    amount
                );
            }
        }

        /// A la genese, le premier deposant capte l'actif deja detenu moins les
        /// parts mortes. Ce n'est pas une fuite, c'est le prix du modele : une
        /// donation faite a un coffre vide n'est adossee a aucune part, et les
        /// parts mortes bornent ce qu'un attaquant peut en tirer.
        ///
        /// Egalite et non inegalite : le comportement est chiffre, donc il est
        /// verrouille. Une derive future se verra.
        #[test]
        fn genese_le_premier_deposant_capte_la_donation_moins_les_parts_mortes(
            amount in 1u64..,
            assets_before in 0u64..,
        ) {
            let out = match shares_for_deposit(amount, 0, assets_before) {
                Ok(out) => out,
                Err(_) => return Ok(()),
            };
            let new_total = match out.to_depositor.checked_add(out.dead) {
                Some(t) => t,
                None => return Ok(()),
            };
            let new_assets = match assets_before.checked_add(amount) {
                Some(a) => a,
                None => return Ok(()),
            };

            if let Ok(back) = assets_for_withdraw(out.to_depositor, new_total, new_assets) {
                prop_assert_eq!(
                    u128::from(back),
                    u128::from(amount) + u128::from(assets_before)
                        - u128::from(MINIMUM_LIQUIDITY)
                );
            }
        }

        /// Les parts mortes sont verrouillees une fois et une seule : a la
        /// genese, jamais apres. Un second verrouillage diluerait sans raison.
        #[test]
        fn parts_mortes_a_la_genese_uniquement(
            amount in 1u64..,
            total_shares in 0u64..,
            assets_before in 0u64..,
        ) {
            let out = match shares_for_deposit(amount, total_shares, assets_before) {
                Ok(out) => out,
                Err(_) => return Ok(()),
            };
            let attendu = if total_shares == 0 { MINIMUM_LIQUIDITY } else { 0 };
            prop_assert_eq!(out.dead, attendu);
        }
    }
}
