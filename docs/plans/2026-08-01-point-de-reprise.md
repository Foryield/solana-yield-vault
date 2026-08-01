# Point de reprise — 1er août 2026

Où on en est, ce qui vient ensuite, et ce qu'il ne faut pas redécouvrir.

| Version | Date | Changement |
|---|---|---|
| 1.1 | 2026-08-01 | Section exploitation corrigée : le risque était mal identifié, il porte sur l'autorité et non sur les paires de clés de programme |
| 1.0 | 2026-08-01 | Premier point de reprise, fin du cycle coffre + hook + preuve devnet |

---

## Acquis

Deux programmes écrits, testés, déployés, et **exercés contre le réseau sur des
actifs réels**. 91 tests, six contrôles d'intégration continue obligatoires,
22 pull requests.

| Élément | Adresse devnet |
|---|---|
| Programme du coffre | `2bkjZG8njXHQ1tdj5aRSiwjjndX1qEvjFYzBYJQjNysw` |
| Programme du hook | `EGbJBdCUK5ecUiVJ9FFiGdVEZQ15cE31zNm97RUpFK63` |
| Coffre USDC | `SWmEZGD1QjPZZqPXBkRfVsmbZpTEd18uJ3RgMEJCwVW` |
| Coffre EURC | `3HDgK4vurCfZRU8cPTJAH3KVEcbsypHzefqLtVXYpXAq` |

Le cycle dépôt, retrait partiel, retrait intégral est prouvé sur les deux
actifs. Preuves et signatures dans `docs/evidence/`.

## Ce qui reste, dans l'ordre où je le ferais

### 1. Le transfert de parts entre porteurs

**C'est la pièce manquante la plus significative.** Le contrôle d'éligibilité
est le cœur du second livrable, et il n'a jamais été exercé sur le réseau : il
ne l'est qu'en simulateur, par les six cas du spike de dérisquage.

Ce qu'il faut : un second porteur avec sa propre clé, un compte de parts, et
deux transactions. Une vers un porteur autorisé, qui doit aboutir. Une vers un
non-autorisé, qui doit être refusée avec le code de la liste et non pour une
autre raison.

Les comptes supplémentaires à joindre sont déjà composés par
`comptesPourTransfert` dans le client, et leur ordre est figé par un test.
Prévoir un peu de SOL pour le second porteur.

### 2. La démonstration web

Sans elle, personne d'autre que nous ne peut essayer quoi que ce soit : tout
passe aujourd'hui par une ligne de commande qui signe avec une clé locale.

Export statique, adaptateur de portefeuille, dépôt et retrait, lecture de
position. La bibliothèque de composition est prête et ne dépend ni d'un
portefeuille ni d'un navigateur : la démonstration n'a qu'à fournir le
signataire.

Point ouvert à trancher avant de commencer : l'hébergement et le sous-domaine.

### 3. Le paquet de provisionnement sans portefeuille

Le parcours où l'utilisateur ne manipule ni extension ni phrase de
récupération. Quatre briques indépendantes imprimant chacune une ligne JSON,
sur le modèle du paquet équivalent du dépôt Soroban.

### 4. L'allocateur et le schéma d'événements

Le second grand chantier. Son cadrage est fait dans la conception, ses venues
sont vérifiées on-chain, et la contrainte Jupiter est identifiée avec sa
résolution. Rien n'est commencé.

### Spikes non bloquants restants

S4 (Jupiter Lend en CPI), S5 (signature Solana par le fournisseur de garde),
S6 (trésorerie et distribution), S7 (validateur forké du mainnet). S6 a déjà
livré l'essentiel de son résultat par anticipation : le robinet plafonne à deux
requêtes par tranche de huit heures.

## Ce qu'il ne faut pas redécouvrir

**Rien dans l'arbre de travail ne porte d'identifiant de programme stable après
un build.** `anchor build` fabrique des paires de clés absentes puis réécrit
`Anchor.toml` et le `declare_id!` des sources pour s'y aligner. Les IDL commis
ne portent donc aucune adresse, et le client l'exige en argument. Trois
corrections successives ont été nécessaires pour l'admettre.

**La couverture ne voit rien du chemin BPF.** Le seuil vise le module
d'arithmétique pure nommément, jamais le total, qui est descendu sous 50 % sans
qu'une ligne cesse d'être testée.

**Un test négatif qui n'exige pas le code d'erreur ne prouve rien.** Il passe
pour un `todo!()` non implémenté comme pour un refus légitime. Et un test
négatif sans contre-épreuve positive ne voit pas qu'on a tout cassé : c'est
ainsi que la délégation est restée brisée un temps sans qu'aucun test ne
bronche.

**Vérifier une correction dans des conditions que l'intégration continue ne
partage pas ne vérifie rien.** Trois échecs de suite l'ont rappelé. Reproduire
la condition d'échec, ou ne pas conclure.

**La pile BPF déborde silencieusement** au-delà de quelques comptes
désérialisés. Les mettre sur le tas d'emblée.

**Le CLI Solana pointe par défaut sur le mainnet.** La ligne de commande
d'administration refuse de deviner le réseau, et exige une confirmation
explicite pour la production.

## Exploitation

Clé de travail `7DsCEFjRBQkWiEPE739QuY4CiRWXQEZbeB1F5RGRsuBP`, environ 13,2 SOL,
10 USDC et 15 EURC. Le robinet public plafonne à deux requêtes par tranche de
huit heures.

### Une seule clé porte tout

Cette clé unique est **autorité de mise à jour des deux programmes,
administrateur des deux coffres, et autorité de liste des deux mints de parts**.
La perdre gèlerait tout, définitivement : plus aucune mise à jour, plus aucune
suspension, plus aucune modification d'éligibilité.

Sa phrase de récupération a été **vérifiée** le 01/08 : dérivée indépendamment,
elle reproduit exactement la clé publique utilisée. Une sauvegarde non vérifiée
n'en est pas une, et celle-ci l'est maintenant.

Cette concentration est acceptable sur un réseau de test. Elle ne l'est pas en
production, où la conception prévoit déjà une signature multiple. **Séparer
l'autorité de mise à jour de l'administration des coffres est un préalable au
passage en production**, pas un raffinement.

### Les paires de clés de programme sont secondaires

Correction d'une affirmation trop forte, faite deux fois avant vérification.
Elles ne servent qu'à déployer un programme à son adresse la **première** fois.
Une fois le programme en place, tout dépend de l'autorité de mise à jour ; et si
un programme était fermé, son adresse deviendrait de toute façon inutilisable à
jamais.

Autrement dit : tant que la phrase de récupération existe et que les programmes
restent déployés, ces fichiers ne servent à rien. Leur sauvegarde n'est donc pas
un point bloquant.

Leurs permissions ont été alignées sur celles de la clé de travail le 01/08 :
elles étaient lisibles par tous, ce qui est sans conséquence sur un réseau de
test mais constitue une habitude à ne pas transporter ailleurs.
