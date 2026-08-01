# Point de reprise - 1er août 2026

Où on en est, ce qui vient ensuite, et ce qu'il ne faut pas redécouvrir.

| Version | Date | Changement |
|---|---|---|
| 1.4 | 2026-08-01 | Premier déploiement Render en échec, cause trouvée : l'installation automatique de la plateforme précède la commande de construction |
| 1.3 | 2026-08-01 | La démonstration web est écrite et éprouvée ; il ne reste d'elle que la mise en ligne |
| 1.2 | 2026-08-01 | Le transfert de parts est fait : il sort de la liste, deux corrections d'exploitation avec lui |
| 1.1 | 2026-08-01 | Section exploitation corrigée : le risque était mal identifié, il porte sur l'autorité et non sur les paires de clés de programme |
| 1.0 | 2026-08-01 | Premier point de reprise, fin du cycle coffre + hook + preuve devnet |

---

## Acquis

Deux programmes écrits, testés, déployés, et **exercés contre le réseau sur des
actifs réels**. 114 tests (66 en Rust, 20 au client, 10 à la ligne de commande,
18 à la démonstration), six contrôles d'intégration continue obligatoires,
23 pull requests fusionnées.

| Élément | Adresse devnet |
|---|---|
| Programme du coffre | `2bkjZG8njXHQ1tdj5aRSiwjjndX1qEvjFYzBYJQjNysw` |
| Programme du hook | `EGbJBdCUK5ecUiVJ9FFiGdVEZQ15cE31zNm97RUpFK63` |
| Coffre USDC | `SWmEZGD1QjPZZqPXBkRfVsmbZpTEd18uJ3RgMEJCwVW` |
| Coffre EURC | `3HDgK4vurCfZRU8cPTJAH3KVEcbsypHzefqLtVXYpXAq` |

Le cycle dépôt, retrait partiel, retrait intégral est prouvé sur les deux
actifs. Le transfert de parts entre porteurs l'est également depuis le 01/08 :
un transfert vers un porteur autorisé aboutit, un transfert vers un porteur qui
ne l'est pas est refusé avec le code de la liste, et une révocation referme la
porte. Preuves et signatures dans `docs/evidence/`.

## Ce qui reste, dans l'ordre où je le ferais

### 1. La démonstration web, à mettre en ligne

**Elle est écrite** (`web/`, dix-huit tests, un contrôle d'intégration continue
dédié) : connexion de portefeuille, dépôt, retrait, transfert avec son refus
affiché dans les mots du programme.

Le premier déploiement Render a échoué et la cause est corrigée (voir plus bas,
« ce qu'il ne faut pas redécouvrir »). La commande du blueprint est désormais
rejouée depuis un arbre vierge **avec `NODE_ENV=production`**, comme la
plateforme la lance.

Ce qui reste tient en trois gestes manuels : créer le service Render depuis le
blueprint du dépôt, y déclarer le domaine `solana.for-yield.com`, poser le CNAME
vers `foryield-solana-demo.onrender.com`. Puis une entrée de preuve nommant
l'URL publique.

Deux choses ne sont pas vérifiées et ne peuvent pas l'être sans un navigateur et
un portefeuille : **le rendu de la page et la signature des trois gestes.** Tout
le reste l'est.

### 2. Le paquet de provisionnement sans portefeuille

Le parcours où l'utilisateur ne manipule ni extension ni phrase de
récupération. Quatre briques indépendantes imprimant chacune une ligne JSON,
sur le modèle du paquet équivalent du dépôt Soroban.

### 3. L'allocateur et le schéma d'événements

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

**Répéter sa propre commande ne répète pas ce que la plateforme fait avant
elle.** La commande de construction du blueprint Render avait été rejouée depuis
un arbre vierge, et le premier déploiement a quand même échoué : Render installe
les dépendances trouvées à sa racine de construction AVANT d'exécuter quoi que
ce soit, et cette installation-là déclenchait le `prepare` du paquet client trop
tôt. D'où l'absence de `rootDir` : la racine du dépôt ne porte pas de
`package.json`, donc rien n'y est installé d'office.

**La pile BPF déborde silencieusement** au-delà de quelques comptes
désérialisés. Les mettre sur le tas d'emblée.

**Le CLI Solana pointe par défaut sur le mainnet.** La ligne de commande
d'administration refuse de deviner le réseau, et exige une confirmation
explicite pour la production.

## Exploitation

Clé de travail `7DsCEFjRBQkWiEPE739QuY4CiRWXQEZbeB1F5RGRsuBP`. Mesuré le 01/08
après la séquence de transfert : 23,257 SOL, 37,999 USDC et 39,999 EURC, plus
1 500 000 parts du coffre USDC. Le robinet public plafonne à deux requêtes par
tranche de huit heures.

Ces montants bougent sans prévenir : ceux de la version 1.0 étaient déjà faux
quelques heures plus tard, un réapprovisionnement ayant eu lieu entre-temps. Les
relire, jamais les recopier.

**Deux porteurs de démonstration** existent sur devnet, clés hors du dépôt et
jamais approvisionnées : `Dz7mzmQS9YDvDMu9faWms41rfcyUM3vZDRXu9ZNhLgKr`, qui
détient 500 000 parts et **est sur la liste**, et
`BeBQQqjuUFU1qjJayMg46CWuaKw7oTJ5R4UfoVLVKohL`, qui n'y a jamais été. La page de
démonstration les propose en préréglage pour montrer les deux verdicts.

Le premier avait été révoqué le 01/08 pour prouver que la révocation mord ; il a
été réautorisé le même jour pour que le cas positif existe dans la
démonstration. **Le révoquer à nouveau casserait un préréglage de la page.**

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
