# Allocateur et schéma d'événements - plan

Chantier ouvert le 2 août 2026, dernier grand chantier du dépôt. Le coffre émet
des parts contre un actif ; l'allocateur place cet actif sur des venues de
rendement et rend compte de chaque mouvement.

| Version | Date | Changement |
|---|---|---|
| 2.0 | 2026-08-04 | Section de reprise écrite pour les étapes 3 et 4 : état d'exploitation, pièges déjà payés, ce qui est tranché et ce qui reste à trancher. L'étape 4 est bloquée sur le choix d'une seconde venue |
| 1.9 | 2026-08-04 | **Les deux dettes soldées.** Conversion inverse mesurée sur cinq mouvements réels, toutes les bornes passent sur la chaîne avec une tolérance gouvernée, horodatage exigé. Un geste de fermeture ajouté, qui sert de chemin de migration |
| 1.8 | 2026-08-04 | **Étape 2 LIVRÉE et éprouvée sur devnet.** Autorité, plafond sur la valorisation, suspension et rachat intégral : les deux refus provoqués exprès |
| 1.7 | 2026-08-04 | Conception de l'étape 2 arrêtée : configuration propre à l'allocateur, plafond sur la valorisation, suspension et retrait intégral libellé en parts. L'étape 1 avait laissé l'opérateur non contraint, c'est le premier point traité |
| 1.6 | 2026-08-04 | **Étape 1 CLOSE, S4 clos.** Dépôt et retrait signés sur devnet. Trois mesures rapportées : l'horodatage tombe sur l'horloge, la venue applique la formule simplifiée et non la conversion en deux temps, le signataire d'une CPI doit être déclaré en écriture |
| 1.5 | 2026-08-04 | Chemin d'exploitation écrit et éprouvé en lecture contre devnet. Les trois programmes de la venue lus sur la chaîne, les graines confirmées, le compte de réclamation existe déjà : le préalable tombe |
| 1.4 | 2026-08-04 | Étape 1 câblée. L'éditeur expose des instructions bornées que la lecture du 02/08 avait manquées : le plancher est désormais appliqué des deux côtés. Rotation des rangs 4 à 6 corrigée |
| 1.3 | 2026-08-03 | Autorité de signature tranchée : une par position, actif et venue, pour que le défaut d'un adaptateur reste borné à sa venue |
| 1.2 | 2026-08-02 | Comptes relevés dans l'IDL : dix-sept et dix-huit confirmés, les deux ordres diffèrent, le rafraîchissement du taux ne coûte aucun compte |
| 1.1 | 2026-08-02 | Vérification chiffrée : la formule simplifiée diverge dans 99,64 % des cas et ferait rejeter tous les dépôts ; marché devnet mesuré non rafraîchi depuis cinq jours |
| 1.0 | 2026-08-02 | Plan initial : trois contraintes trouvées chez l'intégration de référence, quatre étapes, les trois spikes restants rattachés |

Conception de référence : `2026-07-31-solana-yield-vault-design.md`, §3.3 et §5.
Spike : `2026-07-31-spikes-ouverture.md`, S4.

---

## Ce que la lecture de l'intégration de référence a appris

La conception disait de lire marginfi avant d'écrire. Fait le 02/08, et cela
change trois choses.

**Le taux doit être rafraîchi dans la même transaction.** Le compte de marché
porte `token_exchange_price`, mais cette valeur n'est actualisée que par une
instruction `updateRate` du programme de prêt, que marginfi appelle en invocation
croisée **avant** chaque dépôt et chaque retrait. Une position valorisée sans ce
rafraîchissement est fausse d'autant d'intérêts et de récompenses qu'il s'est
écoulé de temps depuis la dernière activité du marché.

**Et le marché peu actif dont le guide met en garde, c'est le nôtre.** Lu le
02/08 sur le marché USDC devnet : son dernier rafraîchissement datait du
28 juillet, soit cinq jours. Le risque n'est donc pas théorique, il est déjà là.

**Un retrait ne peut pas viser une adresse dérivée.** Le programme de prêt ne
sait pas verser vers un compte détenu par un programme : marginfi fait atterrir
le retrait sur un compte de jeton associé intermédiaire, détenu par l'autorité
de son coffre, puis reverse. Ce compte doit exister **avant** le premier
retrait, et rien ne le crée automatiquement. C'est une contrainte
d'architecture, pas un détail d'implémentation : notre allocateur devra porter
ce compte intermédiaire et le documenter comme préalable d'exploitation.

**Deux taux coexistent et se ressemblent.** Le guide met explicitement en garde
contre l'usage du taux de la couche de liquidité, dit cToken, à la place de
celui du jeton de reçu, dit fToken. Les deux vivent dans le même compte,
`liquidity_exchange_price` et `token_exchange_price`. Se tromper ne lève aucune
erreur : cela fausse la valorisation, silencieusement.

Au passage, la structure `Lending` que marginfi déclare est **identique à celle
que S4 avait tirée de l'IDL**, jusqu'à l'ordre des champs. Trois sources
concordent donc maintenant : l'IDL de l'éditeur, la disposition des comptes lus
sur devnet, et cette implémentation tierce.

## La conversion, et pourquoi elle ne se simplifie pas

Le nombre de parts émises par un dépôt suit une conversion **en deux temps, avec
un arrondi intermédiaire** :

```
brut   = plancher(actif * 1e12 / prix_liquidite)
normal = plancher(brut * prix_liquidite / 1e12)
parts  = plancher(normal * 1e12 / prix_jeton)
```

**Mesuré le 02/08 contre les taux réels du marché USDC devnet**, plutôt
qu'affirmé : sur les deux millions de montants compris entre une unité minimale
et deux USDC, la formule simplifiée en une seule division diverge de la vraie
dans **99,64 % des cas**. Ce n'est donc pas un cas limite, c'est le cas général,
et la première rédaction de ce plan le sous-estimait en parlant de « certaines
valeurs ».

La divergence va toujours dans le même sens : la conversion en deux temps rend
**toujours moins ou autant** que la simplifiée. Conséquence directe sur la
décision ci-dessous : avec un plancher exigé, une formule simplifiée
surestimerait l'attendu et **ferait rejeter tous les dépôts**. Se tromper ici ne
produit pas une valorisation légèrement fausse, cela produit un coffre qui
n'accepte plus rien.

La précision `1e12` est une constante du protocole, pas une convention de notre
côté : elle est nommée `EXCHANGE_PRICES_PRECISION` chez l'éditeur et reprise
telle quelle par l'intégration de référence.

### Correction du 04/08 : la venue applique la formule simplifiée

Le premier dépôt réel contredit cette section sur son point central. Pour 2 USDC
et aux prix de la transaction, lus dans son propre événement de taux, la
conversion en deux temps rend **1 979 613** et la division simple **1 979 614**.
La venue a émis **1 979 614**.

Ce qui est écrit plus haut reste juste sur un point, les deux formules divergent
bien ; et faux sur l'autre, c'est la simplifiée qui décrit ce que fait la venue.
La conséquence s'inverse donc : ce n'est pas la simplifiée qui ferait rejeter
les dépôts, c'est **l'égalité stricte fondée sur la conversion en deux temps**,
qui aurait refusé ce dépôt-là.

**La décision était bonne, la prémisse était fausse.** Le plancher a tenu
précisément parce qu'il minore. C'est un argument de plus pour un plancher
plutôt qu'une égalité : nous nous sommes trompés sur leur arithmétique, et le
plancher a absorbé l'erreur au lieu de la transformer en panne.

Portée de cette mesure, dite honnêtement : **un montant, un marché, une
transaction**. Elle ne prouve pas quelle formule tourne chez eux, elle réfute
l'hypothèse que ce soit la conversion en deux temps.

*Élargi le 04/08 même : cinq mouvements réels confirment le modèle dans les
trois sens, dépôt, retrait et rachat. La venue arrondit toujours à son avantage,
plancher sur ce qu'elle donne et plafond sur ce qu'elle prend. Détail dans
[`allocator.md`](../evidence/allocator.md).*

## Deux approches pour se protéger d'une invocation croisée

Un programme tiers peut rendre moins que prévu, ou rien. Il faut le constater
plutôt que l'espérer.

**(A) Égalité exacte, comme marginfi.** Calculer le nombre de parts attendu,
mesurer le solde du compte de reçu avant et après, exiger l'égalité stricte.
Toute divergence annule la transaction. Avantage : aucun écart ne passe.
Inconvénient : notre programme réimplémente l'arithmétique du tiers, donc **une
modification de leur arrondi casse notre programme** alors que rien n'aurait été
volé.

**(B) Plancher exigé, comme une limite de dérapage.** Calculer le même attendu,
mais n'exiger que « pas moins que l'attendu, à une tolérance près ». Avantage :
robuste à une évolution de leur arrondi. Inconvénient : accepte silencieusement
un écart en notre faveur, qui pourrait signaler un changement à comprendre.

**(B) est retenue, avec une tolérance nulle vers le bas et un journal en cas
d'écart vers le haut.** Le raisonnement : (A) transforme un changement d'arrondi
chez un tiers en panne totale de notre coffre, ce qui est un risque de
disponibilité que rien ne compense ; (B) garde la protection qui compte, celle
contre un versement insuffisant, et rend visible ce qu'elle tolère. C'est la
même logique que le montant minimal de sortie déjà retenu pour la jambe
d'échange, transposée à une jambe de prêt.

### Correction du 04/08 : l'éditeur sait déjà faire respecter ce plancher

La relecture de l'IDL avant d'écrire le câblage a trouvé deux instructions que
le relevé du 02/08 avait manquées, parce qu'il s'était arrêté à `deposit` et
`withdraw` : **`depositWithMinAmountOut(assets, minAmountOut)`** et
**`withdrawWithMaxSharesBurn(amount, maxSharesBurn)`**. Mêmes comptes, même
ordre, mêmes droits d'écriture, un argument de plus. Autrement dit, le plancher
décidé ci-dessus, le programme qui émet réellement les jetons sait le faire
respecter lui-même.

**Les deux protections sont retenues, et c'est un choix, pas une hésitation.**
La borne voyage dans la charge utile, donc la venue refuse avant d'écrire quoi
que ce soit ; et l'allocateur mesure quand même les soldes avant et après. La
seconde ne coûte que deux soustractions sur des valeurs que nous lisons
nous-mêmes et ne suppose rien du code du tiers, pas même que sa propre garde
fonctionne.

Cette découverte **renforce (B) au lieu de la remettre en cause**, et sur son
point faible. Le reproche fait à (A) était qu'elle exige de reproduire l'arrondi
du tiers ; avec une borne qu'il applique lui-même, notre arithmétique n'a plus
qu'à le **minorer**. Un changement d'arrondi chez eux ne casse donc plus rien.

Une asymétrie subsiste et elle est assumée : le plancher du dépôt est calculé
sur la chaîne, le plafond du retrait vient de l'appelant. Motif : la conversion
du dépôt a été **mesurée** contre les prix réels du marché, celle du retrait ne
l'a pas été et rien de ce que publie l'éditeur ne la donne. La déduire serait
inventer une borne, exactement ce que ce plan reproche à la formule simplifiée :
trop serrée, elle ferait échouer tous les retraits. **L'étape 2 la reprendra sur
la chaîne le jour où elle aura été mesurée.** En attendant, le contrôle qui
protège réellement ne dépend d'aucune arithmétique : l'actif reçu doit atteindre
le montant demandé, les parts brûlées ne doivent pas dépasser le plafond, et les
deux se lisent sur des soldes.

## Deux approches pour le découpage des instructions

Un dépôt Jupiter Lend consomme dix-sept comptes, un retrait dix-huit.

**(A) Une instruction par venue**, `deposer_jupiter_lend`, `deposer_kamino`, et
ainsi de suite, chacune déclarant ses comptes en dur. Avantage : la validation
des comptes est statique, donc vérifiée par le cadre plutôt que par nous.
Inconvénient : ajouter une venue demande une instruction et un redéploiement.

**(B) Une instruction générique** prenant un identifiant de venue et ses comptes
en comptes restants. Avantage : une seule instruction, extensible sans
redéploiement. Inconvénient : toute la validation devient manuelle et
dynamique, c'est-à-dire exactement l'endroit où les programmes Solana se font
prendre.

**(A) est retenue**, ce que la conception prévoyait déjà et que la lecture de
marginfi confirme : ils ont des instructions dédiées par venue, `juplend_*`,
`solend_*`, `kamino_*`. Sur un programme qui déplace de la valeur, la validation
statique des comptes n'est pas un confort.

## Deux approches pour l'autorité qui signe, et l'isolation tranche

Le câblage a besoin d'une adresse dérivée qui signe les invocations croisées et
détient les jetons de reçu. Ses graines décident du découpage de l'état, donc de
ce qu'une faute peut atteindre.

**(A) Une autorité par actif**, graines `["position", coffre]`. Elle suit la
granularité du coffre, qui est déjà par actif. Toutes les venues d'un même actif
partagent alors un signataire, et un rééquilibrage entre deux venues reste
interne à une seule autorité.

**(B) Une autorité par position**, graines `["position", coffre, marché]`, soit
une par couple actif et venue. Chaque venue est isolée : le signataire qui peut
déplacer les jetons de la venue X ne peut rien contre ceux de la venue Y.

**(B) est retenue.** L'argument est l'isolation, et il n'est pas théorique : un
adaptateur de venue est du code qui parle à un programme tiers dont nous ne
maîtrisons ni les évolutions ni les défauts. Avec (A), un défaut dans un seul
adaptateur exposerait l'actif placé sur toutes les venues du même coffre ; avec
(B), il est borné à la venue concernée. Le coût est nul : une adresse dérivée ne
se paie pas, et le compte est de toute façon transmis à l'instruction.

L'intégration de référence fait le même choix, et pour la même raison
apparente : son autorité est dérivée de la clé de sa banque, et une banque
enveloppe exactement un marché de venue. Corroboration, pas preuve : nous ne
partageons pas son modèle de compte.

Le prix à payer est visible à l'étape 4 : un rééquilibrage entre deux venues
traverse deux autorités, donc deux transferts au lieu d'un mouvement interne. La
contrainte des dix-sept comptes imposait déjà une venue par instruction, donc
une venue par transaction ; ce prix était donc déjà payé.

## Étapes

**Étape 1 - la CPI, et elle clôt S4.** Un dépôt et un retrait Jupiter Lend
réussis sur devnet depuis notre programme, signatures consignées. C'est le
critère de sortie de S4, qui n'a plus que cela à rendre. Passe par un module de
types généré depuis l'IDL de l'éditeur, aucun paquet Rust n'étant publié ;
marginfi procède de même avec un module dédié.

***CLOSE le 04/08.*** *Un dépôt de 2 USDC et un retrait de 1 USDC ont réussi sur
devnet depuis l'allocateur, signatures dans
[`allocator.md`](../evidence/allocator.md). Les journaux confirment que ce sont
les variantes bornées qui s'exécutent, `DepositWithMinAmountOut` et
`WithdrawWithMaxSharesBurn`. **S4 est clos avec elle.***

**Étape 2 - l'adaptateur, ses plafonds et son chemin d'urgence.** Un adaptateur
par venue sous `src/venues/`, plafond par protocole, retrait d'urgence. La
valorisation d'une position lit `token_exchange_price` après rafraîchissement.

***LIVRÉE le 04/08.*** *Configuration et administrateur, position portant son
plafond et sa suspension, rachat intégral d'urgence. Éprouvée sur devnet, les
deux refus provoqués exprès plutôt que supposés : `PlafondDepasse` sur un dépôt
qui aurait franchi le plafond, `PositionSuspendue` sur un dépôt pendant
suspension, et un retrait accepté pendant cette même suspension. Conception
ci-dessous, preuves dans [`allocator.md`](../evidence/allocator.md).*

**Étape 3 - le schéma d'événements.** Spécification versionnée autonome, quatre
familles : dépôt, rachat, accroissement de frais, réallocation. Émission par
auto-invocation et non par journal, décision déjà prise et argumentée dans la
conception : les journaux sont tronqués sous charge, une piste d'audit ne peut
pas reposer là-dessus.

**Étape 4 - la réallocation entre venues.** C'est là que la contrainte de taille
mord : une trentaine de comptes, donc table de recherche d'adresses obligatoire.

## Conception de l'étape 2, arrêtée le 04/08

### Ce que l'étape 1 a laissé ouvert, et qui passe devant les plafonds

**L'allocateur n'a aucune autorisation.** `operateur` est un signataire sans
contrainte, et rien ne le vérifie : n'importe qui peut déclencher un dépôt ou un
retrait sur une position dotée. Il n'existe **pas de chemin de vol**, les comptes
de jeton étant contraints à l'autorité de position et un autre coffre ou un
autre marché dérivant une position différente, donc vide. Mais un tiers décide
quand nos fonds bougent, et peut sortir toute la position de la venue à volonté.

C'est donc le premier point de cette étape, avant les plafonds : un plafond que
n'importe qui peut contourner en appelant l'instruction ne borne rien.

### Trois approches pour l'autorité, l'indépendance tranche

**(A) Une configuration propre à l'allocateur.** Un compte initialisé une fois,
portant un administrateur, qui seul ouvre les positions et agit dessus. Même
forme que la configuration du hook.

**(B) L'administrateur du coffre servi.** L'allocateur lit le compte de coffre
et exige que son administrateur signe. Une seule source de vérité sur qui
gouverne un actif.

**(C) Une autorité par position**, fixée à son ouverture.

**(A) est retenue.** (B) a l'argument le plus séduisant, la source unique, mais
elle recrée exactement le couplage que la conception avait défait en séparant
les deux programmes : l'allocateur dépendrait de la disposition d'un compte
qu'il ne possède pas, et un changement du coffre le casserait en silence. (C)
ne ferme pas la question, elle la déplace : il faut alors décider qui a le droit
d'ouvrir une position, faute de quoi le premier venu s'attribue l'autorité.

Le prix de (A) est réel et assumé : « qui gouverne cet actif » existe à deux
endroits, et rien n'oblige le coffre et l'allocateur à concorder. C'est une
divergence possible, à surveiller en exploitation plutôt qu'à nier.

### Deux approches pour le plafond, la valorisation tranche

**(A) Le cumul déposé net**, suivi dans l'état de la position. Monotone,
lisible, indépendant de tout prix.

**(B) La valorisation de la position**, solde de jetons de reçu multiplié par le
prix rafraîchi.

**(B) est retenue.** (A) ne borne pas ce qu'on veut borner : une position peut
croître très au-delà du cumul déposé par les seuls intérêts, sans que le plafond
s'en aperçoive. (B) borne l'exposition réelle, et son coût est nul puisque le
prix est déjà lu à chaque dépôt.

Effet à connaître plutôt qu'à découvrir : les intérêts peuvent porter la
position **au-dessus** du plafond sans aucun geste de notre part. Cela bloque
alors les nouveaux dépôts et ne force rien à sortir. C'est le comportement
voulu : un plafond dit ce qu'on accepte d'exposer de plus, il n'ordonne pas de
liquider.

Le contrôle se fait **après** l'invocation croisée, sur le solde réellement
constaté, et non avant sur une prévision. La transaction étant atomique, un
dépassement annule tout. Vérifier après coûte une soustraction et supprime
l'écart entre ce qu'on a prévu et ce qui s'est passé.

### Deux gestes pour l'urgence plutôt qu'un

Une **suspension** qui bloque les nouveaux dépôts sans rien déplacer, et un
**retrait intégral** qui sort tout de la venue vers le compte de la position.
Séparer les deux permet d'arrêter l'hémorragie sans décider tout de suite de
sortir. Même posture que le coupe-circuit du coffre, qui suspend sans déplacer.

**Le retrait intégral est libellé en PARTS, pas en actif**, et c'est ce qui le
rend possible. L'éditeur expose `redeemWithMinAmountOut(shares, minAmountOut)`,
dont la liste de comptes est **identique à celle du retrait**, drapeaux compris.
Sortir l'intégralité se dit donc « brûler tout mon solde de parts », sans avoir
à connaître la valeur exacte, là où un retrait libellé en actif laisserait un
reliquat ou échouerait sur un arrondi.

Le montant minimal reste **fourni par l'appelant**, pour la même raison que le
plafond de parts du retrait ordinaire : la conversion inverse n'est toujours pas
mesurée. Un chemin d'urgence dont la borne serait inventée échouerait le jour où
il sert.

## Pour reprendre les étapes 3 et 4, écrit le 04/08

Cette section existe pour qu'une reprise ne recommence pas par redécouvrir ce
qui est déjà tranché, ni par buter sur ce qui est déjà connu comme bloquant.

### État d'exploitation au 04/08, à relire avant tout

L'allocateur est déployé sur devnet en
`BjQJMxT5m4wb6nLBnA91s446hTsj1AL9RiwxVEk2rgGr`, configuration initialisée,
administrateur `7DsCEFjRBQkWiEPE739QuY4CiRWXQEZbeB1F5RGRsuBP`. La position USDC
est ouverte, plafond 3 USDC, tolérance 10 dix-millièmes, non suspendue, **vide
de toute exposition**. Son compte d'actif détient 4 999 996 unités, prêtes à
resservir. Solde d'exploitation 21,04 SOL.

Trois pièges d'exploitation déjà payés, à ne pas repayer. Un redéploiement dont
le binaire a grossi exige `solana program extend` d'au moins 10 240 octets
avant `anchor deploy`, sans quoi l'extension est refusée pour un pas trop
petit. `anchor deploy` échoue systématiquement sur « Failed to initialize IDL »
alors que **le binaire, lui, est bien déployé** : sans effet ici, le client
consommant l'IDL commis et non celui de la chaîne. Et tout changement de
disposition d'une position impose de la fermer puis de la rouvrir, un compte
alloué ne grandissant pas.

### Étape 3, le schéma d'événements : ce qui est décidé, ce qui ne l'est pas

**Déjà tranché par la conception**, à ne pas rediscuter : émission par
auto-invocation et non par les journaux, ceux-ci étant tronqués sous charge et
une piste d'audit ne pouvant pas reposer là-dessus. Quatre familles : dépôt,
rachat, accroissement de frais, réallocation. Publication en spécification
versionnée autonome, avec une implémentation de référence rédigée pour un
protocole sans lien avec ce projet. Convention héritée du routeur Soroban : un
acteur, des instruments, des montants, et la décision d'exécution rendue lisible
en portant à la fois la venue demandée et **la venue qui a réellement servi**.

**Ce qui reste à trancher, et qu'il vaut mieux trancher avant d'écrire :**

*Le coût en comptes.* `#[event_cpi]` d'Anchor ajoute **deux comptes à chaque
instruction** qui émet. Nos mouvements en portent déjà vingt et un ; ce n'est
pas bloquant, mais cela impose un tour complet client, ligne de commande, IDL et
redéploiement, exactement comme les deux tours précédents.

*La famille « accroissement de frais » n'a aucun producteur.* Ni le coffre ni
l'allocateur ne prélèvent de frais aujourd'hui. Elle sera donc **spécifiée sans
être émise**, ce qui est défendable pour une spécification destinée à être
publiée, à condition de le dire dans le document plutôt que de laisser croire à
une couverture complète.

*Où vit la spécification.* Elle est censée être autonome et versionnée, donc pas
dans ce plan. Un fichier propre sous `docs/`, avec sa table d'historique, et un
renvoi depuis ici.

*Quel événement pour quel geste.* À décider explicitement : un dépôt sur la
venue est-il un « dépôt » au sens du schéma, ou une « réallocation » depuis
l'oisif vers une venue ? Les deux lectures se défendent, et le choix change la
forme du flux pour un consommateur.

**Vérification attendue** : une preuve devnet montrant qu'un événement se relit
**depuis les données de la transaction** et non depuis ses journaux. C'est tout
l'objet de la décision d'auto-invocation ; ne pas le prouver reviendrait à
l'affirmer.

### Étape 4, la réallocation : bloquée, et pas par du travail restant

**Il n'existe qu'un adaptateur.** Réallouer entre venues suppose au moins deux
venues ; avec Jupiter Lend seul, il n'y a rien entre quoi réallouer. Ce n'est
pas un reste de travail, c'est un préalable de conception : **choisir la seconde
venue est la première décision de l'étape 4**, avant toute ligne de code.

Deux candidates se distinguent, et pour une raison mesurable : l'intégration de
référence les adresse déjà avec des instructions dédiées, `solend_*` et
`kamino_*`, au même titre que `juplend_*`. Leur ordre de comptes est donc
lisible chez elle, comme celui de Jupiter Lend l'a été.

**Le piège du cluster s'appliquera à l'identique.** Les identifiants de
programme d'une venue sont propres à leur réseau, et les paquets publiés portent
ceux du mainnet. La méthode qui a marché est écrite dans
[`allocator.md`](../evidence/allocator.md) : partir d'un compte que la venue
désigne, et demander à la chaîne qui le possède. Prévoir qu'une venue puisse
n'être pas déployée sur devnet du tout, comme Jupiter Swap.

**Deux contraintes techniques connues.** Une trentaine de comptes impose une
table de recherche d'adresses. Et S7, le validateur local forké du mainnet,
devient le préalable dès que la jambe d'échange entre en jeu, Jupiter Swap
n'existant pas sur devnet.

**Un prix déjà payé, donc pas à repayer** : la contrainte des dix-sept comptes
imposait déjà une venue par transaction. Une réallocation traversant deux
autorités de position coûtera deux transferts au lieu d'un mouvement interne,
ce que la décision du 03/08 sur l'autorité par position avait déjà acté.

## Les trois spikes restants, rattachés pour ne pas être oubliés

**S4** est absorbé par l'étape 1 : il ne lui reste que la CPI, et elle est le
premier geste de ce chantier.

**S6**, trésorerie et distribution, reste **hors de ce chantier** et doit être
mené en parallèle. Il n'est pas technique, il est logistique : script de
distribution éprouvé sur trois adresses, runbook de recharge. Son plafond est
déjà mesuré. Il devient bloquant le jour d'une campagne, jamais avant, et c'est
précisément pourquoi il se fait oublier.

**S7**, validateur local forké du mainnet, est le **préalable de l'étape 4** dès
que la jambe d'échange entre en jeu : Jupiter Swap n'existant pas sur devnet,
c'est le seul moyen d'éprouver ce chemin sans prétendre qu'il tourne là où il ne
tourne pas.

## Les comptes, relevés dans l'IDL le 02/08

Vérifié avant d'écrire, comme annoncé. Le dépôt prend bien **dix-sept** comptes
et le retrait **dix-huit**, ce que la conception annonçait sans l'avoir lu.

| # | Dépôt (`assets: u64`) | Retrait (`amount: u64`) |
|---|---|---|
| 1 | `signer` (écriture, signataire) | `signer` (écriture, signataire) |
| 2 | `depositor_token_account` (é) | `owner_token_account` (é) |
| 3 | `recipient_token_account` (é) | `recipient_token_account` (é) |
| 4 | `mint` | `lending_admin` |
| 5 | `lending_admin` | `lending` (é) |
| 6 | `lending` (é) | `mint` |
| 7 | `f_token_mint` (é) | `f_token_mint` (é) |
| 8 | `supply_token_reserves_liquidity` (é) | `supply_token_reserves_liquidity` (é) |
| 9 | `lending_supply_position_on_liquidity` (é) | `lending_supply_position_on_liquidity` (é) |
| 10 | `rate_model` | `rate_model` |
| 11 | `vault` (é) | `vault` (é) |
| 12 | `liquidity` (é) | **`claim_account`** (é) |
| 13 | `liquidity_program` (é) | `liquidity` (é) |
| 14 | `rewards_rate_model` | `liquidity_program` (é) |
| 15 | `token_program` | `rewards_rate_model` |
| 16 | `associated_token_program` | `token_program` |
| 17 | `system_program` | `associated_token_program` |
| 18 | | `system_program` |

**Les deux ordres ne se déduisent pas l'un de l'autre.** Corrigé le 04/08 : les
rangs 4 à 6 **tournent d'un cran**, ils ne s'échangent pas deux à deux comme le
disait la première rédaction. `mint` descend du rang 4 au rang 6,
`lending_admin` remonte du 5 au 4, `lending` remonte du 6 au 5. Et le retrait
insère `claim_account` au rang 12, décalant tout ce qui suit. Réutiliser l'ordre
du dépôt pour le retrait produirait un compte au mauvais rang, c'est-à-dire
l'échec le plus opaque de Solana. Chaque adaptateur déclare donc ses comptes
séparément, sans facteur commun.

**Le compte de réclamation n'existe que côté retrait.** C'est l'adresse dérivée
que le guide de référence décrit comme une mise en place unique, à créer avant le
premier retrait, et que rien ne crée automatiquement. Le préalable
d'exploitation identifié plus haut a donc un nom et une position.

*Corrigé le 04/08, après lecture de sa dérivation : sa graine n'est pas le
retireur mais **l'administration de la venue**, malgré un nom de graine qui dit
« user », et elle relève du **programme de liquidité**, non de celui des
récompenses. Conséquence : il en existe **un seul par actif**, partagé par tous,
et celui du marché USDC devnet **existe déjà**. Le préalable est donc levé pour
l'actif visé. Il resterait entier pour un actif dont personne n'a jamais retiré.*

**Le rafraîchissement du taux ne coûte aucun compte supplémentaire.** `updateRate`
n'en prend que cinq, et ces cinq figurent déjà parmi les dix-sept du dépôt :
`lending`, `mint`, `f_token_mint`, `supply_token_reserves_liquidity` et
`rewards_rate_model`. L'appeler dans la même transaction ne pèse donc rien sur
le budget de taille, ce qui retire le seul argument qu'on aurait pu avoir contre.

## Ce qui reste à vérifier avant d'écrire

Le comportement de `updateRate` sur notre marché devnet, resté cinq jours sans
rafraîchissement : des récompenses matérialisées d'un coup peuvent surprendre, et
il vaut mieux le constater sur une transaction isolée que dans un dépôt.

***MESURÉ le 04/08, ce point est clos.*** *L'horodatage tombe exactement sur
l'horloge de la transaction : `marche rafraichi a 1785853332, horloge
1785853332`, sur les deux transactions. Le câblage le journalise encore plutôt
que de l'exiger ; l'étape 2 peut maintenant durcir sur cette mesure. Aucune
récompense matérialisée d'un coup n'a été observée.*

## Vérification

Tests unitaires côté hôte sur toute l'arithmétique, seuil de couverture
inchangé. Tests de comportement en simulateur pour le câblage. Puis les preuves
devnet, signatures consignées le jour même, chaque preuve nommant son cluster.
