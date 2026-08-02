# Allocateur et schéma d'événements - plan

Chantier ouvert le 2 août 2026, dernier grand chantier du dépôt. Le coffre émet
des parts contre un actif ; l'allocateur place cet actif sur des venues de
rendement et rend compte de chaque mouvement.

| Version | Date | Changement |
|---|---|---|
| 1.1 | 2026-08-02 | Vérification chiffrée : la formule simplifiée diverge dans 99,64 % des cas et ferait rejeter tous les dépôts ; marché devnet mesuré non rafraîchi depuis cinq jours |
| 1.0 | 2026-08-02 | Plan initial : trois contraintes trouvées chez l'intégration de référence, quatre jalons, les trois spikes restants rattachés |

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

## Jalons

**Jalon 1 - la CPI, et elle clôt S4.** Un dépôt et un retrait Jupiter Lend
réussis sur devnet depuis notre programme, signatures consignées. C'est le
critère de sortie de S4, qui n'a plus que cela à rendre. Passe par un module de
types généré depuis l'IDL de l'éditeur, aucun paquet Rust n'étant publié ;
marginfi procède de même avec un module dédié.

**Jalon 2 - l'adaptateur, ses plafonds et son chemin d'urgence.** Un adaptateur
par venue sous `src/venues/`, plafond par protocole, retrait d'urgence. La
valorisation d'une position lit `token_exchange_price` après rafraîchissement.

**Jalon 3 - le schéma d'événements.** Spécification versionnée autonome, quatre
familles : dépôt, rachat, accroissement de frais, réallocation. Émission par
auto-invocation et non par journal, décision déjà prise et argumentée dans la
conception : les journaux sont tronqués sous charge, une piste d'audit ne peut
pas reposer là-dessus.

**Jalon 4 - la réallocation entre venues.** C'est là que la contrainte de taille
mord : une trentaine de comptes, donc table de recherche d'adresses obligatoire.

## Les trois spikes restants, rattachés pour ne pas être oubliés

**S4** est absorbé par le jalon 1 : il ne lui reste que la CPI, et elle est le
premier geste de ce chantier.

**S6**, trésorerie et distribution, reste **hors de ce chantier** et doit être
mené en parallèle. Il n'est pas technique, il est logistique : script de
distribution éprouvé sur trois adresses, runbook de recharge. Son plafond est
déjà mesuré. Il devient bloquant le jour d'une campagne, jamais avant, et c'est
précisément pourquoi il se fait oublier.

**S7**, validateur local forké du mainnet, est le **préalable du jalon 4** dès
que la jambe d'échange entre en jeu : Jupiter Swap n'existant pas sur devnet,
c'est le seul moyen d'éprouver ce chemin sans prétendre qu'il tourne là où il ne
tourne pas.

## Ce qui reste à vérifier avant d'écrire

L'ordre exact des dix-sept comptes du dépôt, lu dans l'IDL et confronté à la
structure d'accueil de marginfi. Le compte intermédiaire de retrait, sa
propriété et le moment de sa création. Et le comportement de `updateRate` sur un
marché devnet peu actif : les récompenses matérialisées d'un coup peuvent
surprendre.

## Vérification

Tests unitaires côté hôte sur toute l'arithmétique, seuil de couverture
inchangé. Tests de comportement en simulateur pour le câblage. Puis les preuves
devnet, signatures consignées le jour même, chaque preuve nommant son cluster.
