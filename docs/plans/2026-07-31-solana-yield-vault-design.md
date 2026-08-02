# Conception - Solana YieldVault

Document de référence du chantier, rédigé le 31 juillet 2026, avant toute ligne
de programme.

| Version | Date | Changement |
|---|---|---|
| 1.2 | 2026-07-31 | Etancheite du hook etablie par S1 : la liste d'autorisation suffit, aucune extension supplementaire (§3.2) |
| 1.1 | 2026-07-31 | Amendement après S2 et S3 : l'arithmétique du coffre passe en fonctions pures (§3.1), la réserve sur la couverture est levée (§4), les versions Anchor et Agave sont tranchées (§6) |
| 1.0 | 2026-07-31 | Conception initiale |

---

## 1. Objet

Un coffre de rendement DeFi sur Solana, dont l'éligibilité des porteurs est
contrôlée au niveau du jeton lui-même plutôt que par une couche hors chaîne.
Quatre composants, tous sous licence MIT :

1. un programme Anchor `YieldVault` : dépôt d'USDC ou d'EURC, émission de parts
   proportionnelles, retrait, pause d'urgence administrateur ;
2. un module de conformité Token-2022 utilisant les hooks de transfert pour
   imposer les contrôles d'éligibilité et de liste d'autorisation au niveau du
   jeton ;
3. un allocateur routant le capital vers les venues de prêt et de stratégie de
   la DeFi Solana, un adaptateur par venue ;
4. un schéma d'événements de conformité ouvert, produisant une piste d'audit
   lisible par un tiers pour chaque dépôt, rachat, accroissement de frais et
   réallocation.

Le deuxième et le quatrième sont conçus pour être forkés séparément : un
protocole sans aucun lien avec ce projet doit pouvoir reprendre le hook seul, ou
le schéma seul, sans embarquer le reste.

Ce dépôt est le pendant Solana de
[`soroban-yield-vault`](https://github.com/Foryield/soroban-yield-vault), le
même coffre bâti sur Stellar. Les invariants de parts, les conventions
d'arrondi, la protection contre l'inflation de la première part et l'ordre
écriture d'état avant appel externe en sont repris plutôt que réinventés.

L'actif euro retenu est **EURC**, émis par Circle et natif sur Solana.

## 2. Inventaire devnet vérifié

Relevé du 31 juillet 2026, lu contre `https://api.devnet.solana.com`. Aucune
valeur ci-dessous n'est reprise d'une documentation : toutes ont été lues
on-chain.

**Actifs de dépôt.** USDC `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` et
EURC `HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr`, six décimales chacun,
alimentés par le robinet public de Circle. Les deux sont détenus par le
programme SPL classique `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`, et non
par Token-2022. Le coffre manipule donc deux programmes de jeton distincts.

**Token-2022** `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` est exécutable sur
devnet.

**Venues de prêt.** Kamino `KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD` est
exécutable sur devnet, au même identifiant qu'en mainnet, avec 528 comptes
répartis sur huit classes de discriminateurs, donc des marchés réellement
configurés. marginfi est déployé sur devnet mais **pas à son identifiant
mainnet** : son SDK expose deux environnements devnet, `dev` sur
`A7vUDErNPCTt9qrB6SSM4F6GkxzUe9d8P3cXSmRg4eY4` avec le groupe
`52NC7T3NTPFFwoxJDFk9mbKcA7675DJ39H1iPNz5RjSV`, vérifié présent et détenu par ce
programme, et `dev.1` sur `neetcne3Ctrrud7vLdt2ypMm21gZHGN2mCmqWaMVcBQ`.

**Jupiter Lend** est déployé et alimenté sur devnet : Lending
`7tjE28izRUjzmxC1QNXnNwcc4N82CNYCexf3k8mw67s3` (5 comptes, dont quatre marchés ;
adresse propre à devnet, le SDK de l'éditeur ne portant que celle du mainnet),
Liquidity `5uDkCoM96pwGYhAUucvCzLfm5UcjVRuxz6gH81RnRBmL` (32 comptes),
Vaults `Ho32sUQ4NzuAQgkPkHuNDG3G18rgHmYtXFA8EBmqQrAu` (803 comptes). Le décodage
positionnel des quatre marchés faisait apparaître en première clé les mints USDC
devnet, EURC devnet et SOL enveloppé. **Confirmé par l'IDL le 02/08** : le
premier champ est bien l'actif sous-jacent, le quatrième marché portant un actif
non identifié dont le jeton de reçu n'a aucune offre.

**Venues de stratégie et d'échange.** Drift
`dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH` est exécutable sur devnet, au même
identifiant qu'en mainnet. Meteora DLMM
`LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo` également, avec une table de
recherche d'adresses et un administrateur devnet dédiés dans son SDK. Orca
Whirlpool `whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc` est exécutable sur
devnet.

**Jupiter Swap n'est pas déployé sur devnet.** Sur devnet, l'adresse du
programme d'agrégation `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4` a pour
propriétaire le System Program, porte zéro octet de données et n'est pas
exécutable ; sur mainnet, la même adresse a pour propriétaire
`BPFLoaderUpgradeab1e` et porte 36 octets exécutables. L'API confirme : une
cotation demandée sur les mints devnet renvoie `TOKEN_NOT_TRADABLE`, la même sur
les mints mainnet renvoie une route complète via Whirlpool. Seul Lend est
disponible sur devnet ; les API Swap, Trigger, DCA et Price sont mainnet
uniquement.

**Piège de nommage.** Le SDK de Drift déclare pour devnet un USDC
`8zGuJQqwhZafTah7Uc7Z4tXRnguqkn5KLFAP8oV6PHe2`, distinct de celui de Circle.
Même symbole, mint différent. Chaque venue impose le sien, et l'allocateur doit
le traiter comme une donnée de configuration par venue, jamais comme une
constante globale.

## 3. Architecture

### 3.1 Le coffre

`programs/yield-vault`. Différence structurelle avec la version Soroban : les
parts ne sont plus une entrée de stockage tenue par le programme, mais un mint
Token-2022 portant l'extension de hook de transfert. La comptabilité des parts
appartient donc au programme de jeton. Le total des parts est l'offre du mint,
le solde d'un porteur est le solde de son compte de jeton, et le coffre n'en
stocke rien.

État conservé : un compte de coffre en PDA portant l'administrateur, le mint de
l'actif déposé, le mint des parts, l'état de pause et le marché de stratégie.
Les fonds vivent dans un compte de jeton dont le PDA du coffre est l'autorité, et
ce même PDA est l'autorité d'émission des parts. Le coffre dépend des deux
programmes de jeton à la fois, ce que couvre `token_interface` d'Anchor.

Invariants portés depuis la version Soroban, où une revue en a trouvé un défaut
critique de genèse :

- parts égale montant multiplié par le total des parts divisé par les actifs
  d'avant, tronqué, l'arrondi toujours en faveur du coffre ;
- montant du retrait égal aux parts multipliées par les actifs divisés par le
  total des parts, sur l'état d'avant destruction, tronqué de même ;
- parts mortes verrouillées au premier dépôt contre l'attaque par inflation de
  la première part, les actifs déjà détenus entrant dans le total de genèse ;
- refus du dépôt plutôt que division par zéro quand des parts existent sans
  actif ;
- `total_assets` égal au solde oisif plus la valorisation de la position de
  stratégie ;
- écriture d'état avant tout appel externe ;
- erreurs typées plutôt que paniques anonymes, pour que le client hors chaîne
  teste un code.

Le coffre n'emprunte jamais, ce qui garde sa position hors de la matrice de
liquidation des marchés de prêt. Le volet Borrow de Jupiter Lend est
délibérément hors périmètre.

**Découpage imposé par S2 (amendement du 31/07).** Toute cette arithmétique
vit dans des **fonctions pures**, sans `Context` ni compte Anchor en argument,
sous un module dédié testé côté hôte. Les gestionnaires d'instruction se
réduisent à du câblage : lire les soldes, appeler la fonction pure, écrire
l'état, émettre l'événement.

La raison n'est pas esthétique, elle est mesurée. Le spike S2 a établi que le
chemin BPF, qu'emprunte le harnais LiteSVM d'Anchor 1.1.2, rend **zéro pour
cent** de couverture sur le code de programme, alors que la même logique
extraite en fonction pure se mesure à 100 %. Sans ce découpage, aucun seuil de
couverture n'a de sens, et l'arithmétique de parts est précisément l'endroit où
un défaut coûte cher : c'est là qu'une revue avait trouvé le défaut de genèse
sur la version Soroban.

### 3.2 Le hook de conformité

`programs/compliance-hook`, programme séparé implémentant
`spl-transfer-hook-interface`. Le mint des parts porte l'extension pointant vers
lui. Deux instructions : initialisation de la liste de comptes supplémentaires
attachée au mint, et exécution appelée par Token-2022 à chaque transfert.

La liste d'autorisation est faite d'un PDA par adresse autorisée, et non d'un
compte unique qui grossirait sans borne. Vérification à coût constant, aucun
plafond arbitraire sur le nombre de porteurs éligibles.

Ce découplage est délibéré : le coffre reste ignorant de la conformité, et
n'importe quel protocole Solana peut forker le hook seul.

**Étanchéité établie par S1 le 31/07.** La question était de savoir si une voie
de mouvement échappait au hook, auquel cas la liste d'autorisation n'aurait rien
valu. Réponse : aucune.

Le transfert vérifié invoque le hook. Le transfert hérité ne le contourne pas,
il échoue, parce que le chemin sans mint refuse tout compte portant l'extension
`TransferHookAccount`. Et cette extension ne peut pas être esquivée : à
l'initialisation d'un compte, Token-2022 calcule la taille requise depuis les
extensions du mint, rejette un compte trop petit, puis écrit lui-même les
extensions requises. Un mint à hook impose donc l'extension à tous ses comptes.
Les transferts confidentiels, qui empruntent un processeur distinct, invoquent
le hook selon le même motif. La destruction et la fermeture de compte ne
déplacent pas de valeur vers un tiers.

Conséquence de conception : **la liste d'autorisation suffit**, aucune extension
supplémentaire n'est nécessaire pour la rendre étanche. Citations précises et
provenance épinglée dans le verdict S1 du plan de spikes.

### 3.3 L'allocateur

`programs/allocator`, programme séparé. Deux raisons.

La première tient au modèle : la valorisation et le choix de venue se font hors
chaîne, le programme ne garantissant que ce que seul l'on-chain garantit.

La seconde est propre à Solana et elle est dirimante. Un dépôt Jupiter Lend
exige dix-sept comptes, un retrait dix-huit. Une instruction qui porterait
plusieurs venues dépasserait ce qu'une transaction sait transporter ; un
rebalancement entre deux venues en demande une trentaine. D'où : un adaptateur
par venue sous `src/venues/`, une venue par instruction, résolution des comptes
hors chaîne, et table de recherche d'adresses pour tenir dans la transaction.

Il n'existe pas de crate Rust publié pour Jupiter Lend : l'instruction se
construit à la main, discriminateur `sha256("global:deposit")[0..8]`, montant en
`u64` petit-boutiste, comptes énumérés. Le `f_token_mint` de Lend est un jeton de
reçu : la position se valorise par son solde multiplié par son taux, exactement
comme les bTokens du marché de prêt utilisé sur Soroban.

marginfi intègre déjà Jupiter Lend et déclare ses trois programmes en localnet
dans son `Anchor.toml`. Implémentation de référence à lire avant d'écrire la
nôtre.

Chaque venue est bornée par un plafond de protocole et dispose d'un chemin de
retrait d'urgence. Pour la jambe d'échange, le dessin éprouvé sur Soroban est
transposé sans rediscussion : montant minimal de sortie obligatoire, repli
atomique vers la seconde venue dans la même transaction, annulation intégrale si
aucune ne sert. Orca en primaire, Meteora DLMM en secours sur devnet.

### 3.4 Le schéma d'événements de conformité

Publié en spécification versionnée autonome avec implémentation de référence,
rédigée pour un protocole sans aucun lien avec ce projet.

Décision technique qui le conditionne : Anchor propose d'émettre soit dans les
journaux du programme, soit encodé dans les données d'une auto-invocation. Les
journaux sont tronqués. Une piste d'audit ne peut pas reposer sur un canal qui
perd des données sous charge, donc ce sera la seconde, et l'argument sera écrit
dans la spécification plutôt que subi.

La convention vient du routeur Soroban : un acteur, des instruments, des
montants, et la décision d'exécution rendue lisible en portant à la fois la
venue demandée et la venue qui a réellement servi, pour qu'un consommateur du
seul flux voie qu'un repli a eu lieu. Quatre familles : dépôt, rachat,
accroissement de frais, réallocation.

### 3.5 Briques hors chaîne

`app/` : démonstration en export statique, adaptateur de portefeuille Solana
couvrant Phantom, Solflare, Backpack et Ledger, dépôt et retrait sur devnet.

`onboarding/` : parcours où l'utilisateur ne manipule ni extension ni phrase de
récupération. Quatre briques, provisionnement du portefeuille via l'API DFNS sur
`SolanaDevnet`, construction et simulation de l'enveloppe, diffusion et
confirmation, orchestrateur. Chacune imprime une ligne JSON sur la sortie
standard et les erreurs sur la sortie d'erreur, pour être appelée en
sous-processus depuis n'importe quel dorsal, quel que soit son langage.

Deux écueils d'exploitation identifiés maintenant parce qu'ils mordent tard. Le
financement en SOL : la distribution par le RPC devnet est plafonnée et souvent à
sec, donc une trésorerie devnet alimentée une fois puis redistribuée. Même chose
pour USDC et EURC, le robinet de Circle étant limité par adresse. Ce n'est pas du
code, c'est un runbook, mais un runbook absent le jour d'une campagne coûte une
semaine.

## 4. Stratégie de preuve

- un plan écrit dans `docs/plans/` avant chaque chantier ;
- les signatures de transaction consignées dans `docs/evidence/` le jour même,
  jamais reconstituées après coup ;
- tout passe par une PR fusionnée sur intégration continue verte ;
- un seuil de couverture qui exclut les fichiers de test, faute de quoi il cesse
  de mordre. Sur le dépôt Soroban, cette exclusion avait fait tomber le chiffre
  affiché de 99,07 % à 94,89 %.

Pour les intégrations de venues, l'équivalent des wasm vendorisés utilisés sur
Soroban est un validateur local qui clone les comptes du mainnet. C'est ainsi
que le chemin Jupiter Swap sera éprouvé sans prétendre qu'il tourne sur devnet,
et marginfi montre déjà le motif dans son propre dépôt.

**Couverture : réserve levée par S2 le 31/07.** La mesure est possible, mais
elle ne porte **que sur la logique pure compilée côté hôte**. Le harnais
LiteSVM d'Anchor 1.1.2 exécute le `.so` en BPF et rend zéro pour cent sur le
code de programme, alors que la même logique extraite en fonction pure se
mesure intégralement. Le seuil portera donc sur le module d'arithmétique, et le
câblage restera couvert par des tests de comportement plutôt que par un
pourcentage.

C'est une frontière plus saine que sur Soroban, où il avait fallu exclure les
fichiers de test pour que le seuil morde encore : ici les tests d'intégration
vivent sous `tests/`, hors du périmètre mesuré. Le chiffre à retenir viendra de
la première campagne de tests du coffre, pas d'un programme témoin.

## 5. Contrainte Jupiter

Jupiter Swap n'étant pas sur devnet, le routage se répartit ainsi :

- les rebalancements entre venues de rendement sur devnet passent par **Jupiter
  Lend**, déployé et alimenté, avec des marchés USDC et EURC ;
- la jambe d'échange proprement dite, la conversion USDC vers EURC, passe par
  Orca ou Meteora sur devnet, et par Jupiter Swap sur mainnet ;
- le chemin Jupiter Swap est éprouvé contre un validateur local forké du
  mainnet.

Chaque preuve nomme son cluster. Rien dans ce dépôt ne laissera croire que le
routage Jupiter Swap tourne sur devnet.

## 6. Points ouverts

1. ~~Ce qui déclenche réellement le hook de transfert.~~ **Tranché le 31/07** :
   aucune voie de mouvement n'y échappe, la liste d'autorisation suffit (§3.2).
2. ~~Faisabilité et niveau de la mesure de couverture.~~ **Tranché le 31/07** :
   mesurable sur la logique pure côté hôte uniquement, cf. §3.1 et §4.
3. ~~Alignement des versions Anchor et Agave.~~ **Tranché le 31/07 contre le
   réseau** : devnet en `solana-core 4.1.2`, jeu de fonctionnalités 3345198602 ;
   Agave 4.1.2 et Anchor 1.1.2 retenus, Rust épinglé sur 1.89.0 par
   `rust-toolchain.toml`. La page d'installation d'Anchor annonçait Agave
   2.0.26, deux versions majeures de retard ; le pin d'Anchor 1.0.2 de marginfi
   est lui aussi en retard sur le réseau et n'a donc pas été suivi.
4. ~~Confirmation par l'IDL que les quatre marchés Jupiter Lend devnet portent
   bien USDC et EURC en actif sous-jacent.~~ **Tranché le 02/08 par l'IDL**,
   embarqué dans le paquet publié par l'éditeur, la chaîne n'en portant aucun.
   Le compte `Lending` commence par `mint` puis `f_token_mint` ; le
   discriminateur et la taille de 196 octets concordent à l'octet près. USDC et
   EURC de Circle sont bien deux des quatre marchés, et les deux sont alimentés.
   La valorisation se lit dans le marché même, champ `token_exchange_price`,
   récompenses comprises. Détail en S4.
5. ~~Hébergement de la démonstration.~~ **Tranché le 01/08** : Render en service
   statique depuis le blueprint du dépôt, sous-domaine `solana.for-yield.com`,
   point d'accès dédié dont la clé ne réside pas ici. Ce que le déploiement a
   appris est dans `evidence/demonstration-web.md`.
6. ~~Clé d'exploitation devnet et approvisionnement en SOL.~~ **Tranché le
   31/07** : la clé existe, elle est approvisionnée, et sa phrase de
   récupération a été vérifiée par dérivation indépendante le 01/08. Le piège du
   CLI pointant par défaut sur `mainnet-beta` est traité par une configuration
   qui refuse de deviner le réseau. Reste de S6 : le runbook de distribution.

Les six points sont traités par `2026-07-31-spikes-ouverture.md`. Tous sont
tranchés au 02/08.
