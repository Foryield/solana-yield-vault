# Allocateur et schéma d'événements - plan

Chantier ouvert le 2 août 2026, dernier grand chantier du dépôt. Le coffre émet
des parts contre un actif ; l'allocateur place cet actif sur des venues de
rendement et rend compte de chaque mouvement.

| Version | Date | Changement |
|---|---|---|
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

*Au 04/08 : le câblage est écrit et vérifié contre l'IDL, les deux instructions
`deposer_jupiter_lend` et `retirer_jupiter_lend` existent, l'autorité de
position signe. Le chemin d'exploitation est écrit lui aussi et **éprouvé en
lecture contre devnet** : les vingt-deux adresses se dérivent, les dix de la
venue existent toutes, et le compte de réclamation qu'on croyait bloquant existe
déjà. Voir `docs/evidence/allocator.md`.*

***Il ne manque plus qu'un déploiement et deux transactions.** L'allocateur n'a
jamais été déployé : aucun binaire ne répond à son adresse. Tant que le dépôt et
le retrait ne sont pas signés sur devnet, l'étape 1 n'est pas close et S4 non
plus.*

**Étape 2 - l'adaptateur, ses plafonds et son chemin d'urgence.** Un adaptateur
par venue sous `src/venues/`, plafond par protocole, retrait d'urgence. La
valorisation d'une position lit `token_exchange_price` après rafraîchissement.

**Étape 3 - le schéma d'événements.** Spécification versionnée autonome, quatre
familles : dépôt, rachat, accroissement de frais, réallocation. Émission par
auto-invocation et non par journal, décision déjà prise et argumentée dans la
conception : les journaux sont tronqués sous charge, une piste d'audit ne peut
pas reposer là-dessus.

**Étape 4 - la réallocation entre venues.** C'est là que la contrainte de taille
mord : une trentaine de comptes, donc table de recherche d'adresses obligatoire.

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

*Au 04/08, ce point reste ouvert et le câblage en tient compte : l'horodatage du
dernier rafraîchissement est **journalisé, pas exigé**. Exiger qu'il tombe sur
l'horloge de la transaction supposerait connaître la façon dont la venue le
pose, ce que nous n'avons pas lu ; une exigence fausse ferait échouer tous les
dépôts. La première preuve devnet dira ce que vaut cet horodatage juste après un
rafraîchissement, et l'étape 2 pourra alors durcir sur une mesure.*

## Vérification

Tests unitaires côté hôte sur toute l'arithmétique, seuil de couverture
inchangé. Tests de comportement en simulateur pour le câblage. Puis les preuves
devnet, signatures consignées le jour même, chaque preuve nommant son cluster.
