# Point de reprise - 1er août 2026

Où on en est, ce qui vient ensuite, et ce qu'il ne faut pas redécouvrir.

| Version | Date | Changement |
|---|---|---|
| 3.2 | 2026-08-04 | Chantier de l'allocateur mis en pause après l'étape 2 : section de reprise écrite dans son plan pour les étapes 3 et 4 |
| 3.1 | 2026-08-04 | **Les deux dettes de l'allocateur soldées** : bornes de sortie calculées sur la chaîne, horodatage exigé. Reste l'étape 3, et l'étape 4 qui suppose une seconde venue |
| 3.0 | 2026-08-04 | **Étape 2 de l'allocateur livrée** : autorité, plafond sur la valorisation, suspension, rachat intégral d'urgence. Éprouvée sur devnet, refus compris |
| 2.9 | 2026-08-04 | **S4 CLOS.** Dépôt et retrait Jupiter Lend signés sur devnet depuis l'allocateur. L'étape 1 est close, il reste les étapes 2 à 4 |
| 2.8 | 2026-08-04 | Chemin d'exploitation écrit et éprouvé en lecture contre devnet. Il ne manque plus qu'un déploiement et deux transactions pour clore S4 |
| 2.7 | 2026-08-04 | Câblage de l'étape 1 écrit : dépôt et retrait Jupiter Lend bornés des deux côtés. Il ne manque que le chemin d'exploitation et la preuve devnet |
| 2.6 | 2026-08-03 | Autorité de signature de l'allocateur tranchée : une par position |
| 2.5 | 2026-08-02 | Allocateur : les trois pièces pures de l'étape 1 sont écrites et couvertes, il ne reste que le câblage |
| 2.4 | 2026-08-02 | Plan de l'allocateur écrit : trois contraintes trouvées chez l'intégration de référence, les trois spikes rattachés |
| 2.3 | 2026-08-02 | Points ouverts 5 et 6 de la conception clos, ils l'étaient depuis des jours ; décomptes remis à jour |
| 2.2 | 2026-08-02 | Dépôt et retrait signés depuis la page ; le point d'accès dédié ne sert pas les abonnements, la confirmation passe au sondage |
| 2.1 | 2026-08-02 | S4 partiel : marchés Jupiter Lend confirmés par l'IDL, l'allocateur peut être planifié |
| 2.0 | 2026-08-02 | S5 CLOS : un portefeuille sous garde a déposé sur devnet, sans extension ni phrase de récupération |
| 1.9 | 2026-08-02 | L'identifiant de credential se lit dans le défi et n'est plus réclamé à l'opérateur |
| 1.8 | 2026-08-02 | La diffusion par la garde est asynchrone : corrigé avant tout essai réel |
| 1.7 | 2026-08-02 | Paquet de provisionnement écrit et éprouvé hors ligne ; il ne lui manque que le compte de service et sa preuve |
| 1.6 | 2026-08-02 | Point d'accès dédié en service, le point ouvert est clos ; la démonstration sort de la liste des restes |
| 1.5 | 2026-08-01 | La démonstration est en ligne et harmonisée sur la forme Soroban ; le point d'accès RPC devient un point ouvert |
| 1.4 | 2026-08-01 | Premier déploiement Render en échec, cause trouvée : l'installation automatique de la plateforme précède la commande de construction |
| 1.3 | 2026-08-01 | La démonstration web est écrite et éprouvée ; il ne reste d'elle que la mise en ligne |
| 1.2 | 2026-08-01 | Le transfert de parts est fait : il sort de la liste, deux corrections d'exploitation avec lui |
| 1.1 | 2026-08-01 | Section exploitation corrigée : le risque était mal identifié, il porte sur l'autorité et non sur les paires de clés de programme |
| 1.0 | 2026-08-01 | Premier point de reprise, fin du cycle coffre + hook + preuve devnet |

---

## Acquis

Trois programmes écrits, testés, déployés, et **exercés contre le réseau sur des
actifs réels**. 237 tests (99 en Rust, 31 au client, 16 à la ligne de commande,
26 à la démonstration, 65 au paquet de provisionnement), sept contrôles
d'intégration continue obligatoires, 44 pull requests fusionnées.

**Tous les points ouverts de la conception sont tranchés.**

| Élément | Adresse devnet |
|---|---|
| Programme du coffre | `2bkjZG8njXHQ1tdj5aRSiwjjndX1qEvjFYzBYJQjNysw` |
| Programme du hook | `EGbJBdCUK5ecUiVJ9FFiGdVEZQ15cE31zNm97RUpFK63` |
| Programme de l'allocateur | `BjQJMxT5m4wb6nLBnA91s446hTsj1AL9RiwxVEk2rgGr` |
| Coffre USDC | `SWmEZGD1QjPZZqPXBkRfVsmbZpTEd18uJ3RgMEJCwVW` |
| Coffre EURC | `3HDgK4vurCfZRU8cPTJAH3KVEcbsypHzefqLtVXYpXAq` |

Le cycle dépôt, retrait partiel, retrait intégral est prouvé sur les deux
actifs. Le transfert de parts entre porteurs l'est également depuis le 01/08 :
un transfert vers un porteur autorisé aboutit, un transfert vers un porteur qui
ne l'est pas est refusé avec le code de la liste, et une révocation referme la
porte. Preuves et signatures dans `docs/evidence/`.

**Et un porteur peut déposer sans tenir aucune clé** : depuis le 02/08, un
portefeuille créé chez le fournisseur de garde à partir d'un simple identifiant
a signé un dépôt confirmé sur devnet, sans extension ni phrase de récupération.
Le signataire de la transaction est ce portefeuille lui-même, dont nous n'avons
jamais tenu la clé. Preuve dans `docs/evidence/provisionnement-sous-garde.md`.

**Et tout cela est essayable sans cloner quoi que ce soit** :
<https://solana.for-yield.com>, servi par Render depuis le blueprint du dépôt,
sur un point d'accès dédié dont la clé ne rentre pas ici. Ce que le déploiement
a appris est consigné dans `docs/evidence/demonstration-web.md`.

**Vérifié avec un portefeuille le 02/08** : dépôt et retrait signés depuis la
page avec Phantom, passés sur devnet, écran connecté compris. Le transfert reste
le seul geste non essayé depuis la page.

Cette vérification a trouvé ce qu'aucun contrôle automatique ne pouvait trouver :
la page se figeait après la signature puis déclarait la transaction expirée,
alors qu'elle avait réussi. Corrigé, et consigné dans
`docs/evidence/demonstration-web.md`.

## Ce qui reste, dans l'ordre où je le ferais

### 1. L'allocateur et le schéma d'événements

Le grand chantier restant. **Son plan est écrit le 02/08** et porte quatre
étapes : la CPI qui clôt S4, l'adaptateur avec ses plafonds, le schéma
d'événements, puis la réallocation.

**L'étape 1 est CLOSE le 04/08, et S4 avec elle.** Un dépôt de 2 USDC et un
retrait de 1 USDC ont réussi sur devnet depuis l'allocateur, signant par son
autorité de position. Signatures dans [`allocator.md`](../evidence/allocator.md).

Les trois pièces pures ont été écrites avant tout câblage, et le câblage avant
tout appel réseau : chaque pièce était éprouvée avant celle qui l'appelle.

L'arithmétique de conversion, en deux temps avec arrondi intermédiaire, éprouvée
sur les taux réels du marché. La lecture du compte de marché, éprouvée sur les
octets réels de devnet et non sur des octets fabriqués. La composition des
instructions, dont l'ordre des comptes vient de l'IDL et n'est pas partagé entre
dépôt et retrait. Les trois sont couvertes à 100 %.

**Le câblage est écrit le 04/08** : `deposer_jupiter_lend` et
`retirer_jupiter_lend` enchaînent rafraîchissement, lecture, calcul, invocation
signée par l'autorité de position, puis mesure du delta. Ils vivent sous
`src/instructions/`, hors du périmètre de couverture, ce qui est cohérent
puisqu'ils ne font que du câblage ; les pièces qu'ils appellent restent à 100 %.

La décision qui l'attendait a été **tranchée le 03/08** : une autorité de
signature par position, c'est-à-dire par couple actif et venue, graines
`["position", coffre, marché]`. Motif : un adaptateur parle à un programme tiers
dont nous ne maîtrisons rien, et son défaut doit rester borné à sa venue plutôt
que d'exposer tout l'actif du coffre. Argumentée dans le plan.

**Une relecture de l'IDL le 04/08 a trouvé ce que celle du 02/08 avait manqué :**
l'éditeur expose `depositWithMinAmountOut` et `withdrawWithMaxSharesBurn`, mêmes
comptes et mêmes droits, un argument de plus. Le plancher est donc appliqué des
deux côtés, par la venue et par nous. Ce qui n'avait pas pu être mesuré n'a pas
été deviné pour autant, et est resté ouvert sous forme de dettes nommées jusqu'à
ce qu'une mesure les solde le jour même.

**Le chemin d'exploitation est écrit le 04/08 et éprouvé en lecture contre
devnet.** Le client dérive les adresses des deux côtés, la ligne de commande
porte cinq gestes nouveaux (`venue` pour inspecter sans rien signer, puis
`preparer`, `approvisionner`, `placer`, `rapatrier`), et les trois identifiants
de programme de la venue ont été **lus sur la chaîne** plutôt que recopiés du
paquet, qui ne connaît que le mainnet. Les dix comptes de la venue existent
tous, compte de réclamation compris : le préalable que le plan annonçait
bloquant est levé. Relevé et méthode dans
[`allocator.md`](../evidence/allocator.md).

**L'allocateur est déployé sur devnet** à l'adresse
`BjQJMxT5m4wb6nLBnA91s446hTsj1AL9RiwxVEk2rgGr`, autorité de mise à jour au
portefeuille d'exploitation, comme les deux autres programmes.

**Trois choses que seul le réseau pouvait apprendre**, toutes consignées. Le
signataire d'une invocation croisée doit être déclaré en écriture chez
l'appelant, sans quoi l'exécution s'arrête sur un message qui nomme le compte et
pas la cause. L'horodatage de rafraîchissement tombe exactement sur l'horloge de
la transaction, ce qui referme un point ouvert du plan. Et **la venue applique
la formule simplifiée, non la conversion en deux temps** : le plan supposait
l'inverse, et l'égalité stricte qu'il avait écartée aurait refusé ce dépôt. La
décision était bonne, la prémisse était fausse.

**L'étape 2 est livrée le 04/08 et éprouvée sur devnet.** L'allocateur porte une
configuration avec son administrateur, chaque position porte son plafond et sa
suspension, et un rachat intégral d'urgence sort tout sans exiger de valoriser
d'abord. Les deux refus ont été provoqués exprès plutôt que supposés.

Cette étape a d'abord fermé un trou que l'étape 1 avait laissé : `operateur`
était un signataire sans contrainte, donc n'importe qui pouvait déclencher un
mouvement. Aucun vol n'était possible, les comptes de jeton étant liés à la
position, mais un tiers décidait quand les fonds bougeaient.

**Les deux dettes sont soldées le 04/08.** La conversion inverse de la venue a
été établie sans dépenser une transaction de plus, en relisant le prix exact de
chacun des cinq mouvements dans son propre événement de taux. Toutes les bornes
sont désormais calculées sur la chaîne, écartées d'une tolérance gouvernée
plutôt que posées exactes, et l'horodatage de rafraîchissement est exigé.

**Le chantier est mis en pause après l'étape 2, le 04/08.** Ce qui reste, et
comment le reprendre, est écrit dans la section « Pour reprendre les étapes 3
et 4 » du plan de l'allocateur : état d'exploitation devnet, pièges déjà payés,
ce qui est tranché et ce qui reste à trancher.

En deux lignes. L'étape 3, le schéma d'événements, n'est pas bloquée mais
demande un tour complet, `#[event_cpi]` ajoutant deux comptes à chaque
instruction. L'étape 4, la réallocation, **est bloquée sur une décision** :
choisir une seconde venue, faute de quoi il n'y a rien entre quoi réallouer.

La lecture de l'intégration de référence a trouvé trois contraintes que la
conception ignorait : le taux doit être rafraîchi dans la même transaction, un
retrait ne peut pas viser une adresse dérivée et exige un compte intermédiaire,
et deux taux se ressemblent au point qu'une confusion fausse la valorisation
sans rien signaler. Détail dans
[`2026-08-02-allocateur-plan.md`](./2026-08-02-allocateur-plan.md).

### 2. Le payeur de frais du parcours sous garde

Réserve écrite au verdict S5 plutôt que tue : la trésorerie dote chaque
portefeuille neuf en SOL, ce qui tient pour une démonstration et pas au delà. La
forme visée sépare le payeur de frais du signataire, de sorte qu'un utilisateur
n'ait jamais à détenir de SOL. Elle demande d'assembler deux signatures hors
ligne au lieu d'emprunter le chemin nominal du fournisseur, d'où son report
délibéré après la preuve.

### Spikes non bloquants restants

S4 (Jupiter Lend en CPI), S6 (trésorerie et distribution), S7 (validateur forké
du mainnet). **S4 a rendu son premier volet le 02/08** : les quatre marchés
devnet sont décodés par l'IDL de l'éditeur, USDC et EURC en sont deux et sont
alimentés, et la valorisation se lit dans le marché même. Ne reste que la CPI. S6 a déjà livré l'essentiel de son résultat par anticipation : le
robinet plafonne à deux requêtes par tranche de huit heures.

S5 est **clos** depuis le 02/08 : la chaîne du fournisseur de garde tient de
bout en bout, du portefeuille créé au dépôt confirmé.

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

**Un sous-domaine demande deux gestes, pas un.** Le CNAME chez l'hébergeur DNS
ne suffit pas : le domaine doit aussi être déclaré sur le service Render, qui
sert plusieurs sites derrière la même adresse. Sans cette déclaration,
Cloudflare rend un 403 « DNS points to prohibited IP » qui accuse le DNS alors
que le DNS est juste.

**Répéter sa propre commande ne répète pas ce que la plateforme fait avant
elle.** La commande de construction du blueprint Render avait été rejouée depuis
un arbre vierge, et le premier déploiement a quand même échoué : Render installe
les dépendances trouvées à sa racine de construction AVANT d'exécuter quoi que
ce soit, et cette installation-là déclenchait le `prepare` du paquet client trop
tôt. D'où l'absence de `rootDir` : la racine du dépôt ne porte pas de
`package.json`, donc rien n'y est installé d'office.

**Un point d'accès RPC dédié ne sert pas forcément les abonnements.** Le nôtre
accepte la connexion WebSocket et refuse `signatureSubscribe` en -32601. Tout ce
qui repose dessus, `confirmTransaction` en tête, attend une notification qui
n'arrive jamais puis ment sur la cause. Le point d'accès public, lui, les sert :
le remède à la limite de débit a introduit ce défaut. Confirmer par sondage HTTP
de `getSignatureStatuses`, jamais par abonnement.

**Une adresse de programme tierce est propre à son cluster, et un SDK n'en porte
qu'une.** Le paquet publié par l'éditeur de Jupiter Lend code en dur l'adresse du
mainnet, absente de devnet, quand le programme devnet est absent du mainnet : les
deux sont disjointes. Même piège que marginfi. Prendre l'adresse d'un SDK pour
argent comptant produit un compte introuvable, symptôme le plus opaque de Solana.

**Le fournisseur de garde n'a pas d'API de bac à sable**, et l'hôte
historiquement présenté comme tel est déprécié. Un seul hôte sert le mainnet et
les réseaux de test : aucune vérification d'URL ne sépare donc la production du
reste, contrairement à ce que le garde-fou S5 supposait d'abord. Ce qui les
sépare est le compte de service, la permission qui lui est attachée, et le
réseau demandé. Seul le dernier est vérifiable par un programme, d'où la
constante figée dans `onboarding/src/config.ts` et la lecture de l'empreinte de
genèse avant tout geste.

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

**La démonstration est sondée toutes les six heures** par
`.github/workflows/veille-demonstration.yml` : la page répond, le paquet servi
porte un point d'accès dédié, ce point d'accès répond, le coffre s'y lit. Un
échec prévient sans rien bloquer. La sonde ne porte aucun secret, elle lit
l'URL du point d'accès dans le paquet servi comme le fait un navigateur.

**Le point d'accès de la page en ligne** est dédié et sa clé vit au tableau de
bord de Render, jamais ici. Le blueprint la déclare `sync: false`, donc une
synchronisation ne l'écrase pas ; en revanche, recréer le service depuis zéro
demandera de la ressaisir. Elle est restreinte à son domaine d'origine, ce qui
est la seule chose qui la protège : un export statique n'a pas de serveur pour
la cacher.

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
