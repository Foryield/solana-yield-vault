# Module de conformité Token-2022 — plan

Plan d'exécution du programme `compliance-hook`. Suppose lus la conception
(`2026-07-31-solana-yield-vault-design.md`, §3.2) et le verdict du spike S1.

| Version | Date | Changement |
|---|---|---|
| 1.4 | 2026-07-31 | Tâche 5 : hook déployé sur devnet ; reste le branchement à un mint réel, qui demande un client |
| 1.3 | 2026-07-31 | Tâche 4 livrée : la réserve de méthode de S1 est LEVÉE ; un défaut cassant toute délégation trouvé au passage |
| 1.2 | 2026-07-31 | Tâches 2 et 3 livrées ; deux défauts trouvés par les tests, dont un de harnais |
| 1.1 | 2026-07-31 | Tâche 1 livrée ; identifiant du hook `EGbJBdCUK5ecUiVJ9FFiGdVEZQ15cE31zNm97RUpFK63` |
| 1.0 | 2026-07-31 | Plan initial, 5 tâches |

---

## Ce que S1 a déjà réglé, et ce qu'il n'a pas réglé

**Réglé.** Aucune voie de mouvement de parts n'échappe au hook. Le transfert
hérité échoue au lieu de contourner, l'extension `TransferHookAccount` ne peut
pas être esquivée puisque Token-2022 l'écrit lui-même à l'initialisation d'un
compte, les transferts confidentiels invoquent le hook selon le même motif, et
ni la destruction ni la fermeture ne déplacent de valeur vers un tiers.

Autrement dit : **si le hook refuse, le transfert n'a pas lieu**. C'est acquis
et ce n'est pas à re-démontrer.

**Non réglé, et c'est l'objet de ce chantier.** Que le hook soit *appelé* ne dit
rien de ce qu'il *décide*. Toute la surface d'attaque restante est là : un hook
qui laisse passer ce qu'il devrait refuser, ou qu'on peut appeler hors d'un
vrai transfert.

## Menace propre au hook, absente du coffre

Le coffre n'est appelé que par des utilisateurs. Le hook, lui, est appelé **par
Token-2022 en CPI**, et son instruction `Execute` est publique comme n'importe
quelle autre. Rien n'empêche un tiers de l'invoquer directement avec les comptes
de son choix.

Un hook qui se contente de vérifier la liste d'autorisation serait sans danger
dans ce cas, puisqu'il ne déplace rien lui-même. Mais un hook appelé hors
transfert peut servir de brique à autre chose, et surtout la garde coûte trois
lignes : Token-2022 pose un drapeau `transferring` sur les deux comptes pendant
l'appel, et le retire ensuite. **Le hook exige ce drapeau.** Un appel direct
n'a aucun moyen de le poser.

C'est le pendant, côté hook, du « refuser plutôt que supposer » appliqué à
l'arithmétique du coffre.

## Décisions de conception

### Représentation de la liste

Actée en conception : **un PDA par adresse autorisée**, dérivé du mint et de
l'adresse. Vérification à coût constant, aucun plafond sur le nombre de
porteurs, et une révocation est une fermeture de compte dont le dépôt revient à
l'autorité.

L'alternative, un compte unique portant un tableau, imposerait un plafond
arbitraire et ferait croître le coût de lecture avec le nombre de porteurs.
Pour un produit qui vise d'abord des dizaines d'investisseurs puis davantage,
c'est le mauvais sens.

### Comment le hook trouve l'entrée à vérifier

Token-2022 ne passe que quatre comptes fixes : source, mint, destination et
autorité de la source. Les comptes supplémentaires dont le hook a besoin sont
déclarés une fois pour toutes dans une `ExtraAccountMetaList`, un PDA attaché au
mint que le programme de jeton lit pour compléter l'instruction.

La déclaration décrit l'entrée de liste comme un PDA dérivé de **données lues
dans un compte de l'instruction** : le propriétaire du compte de destination, à
son décalage connu. Le client n'a donc rien à calculer et ne peut pas mentir sur
l'adresse vérifiée, puisque c'est Token-2022 qui dérive.

C'est le point le plus délicat du chantier, et celui à éprouver en premier.

### Ce qu'on vérifie, et sur qui

**Le destinataire**, pas l'émetteur. Un porteur éligible doit pouvoir sortir
vers un tiers éligible ; ce qu'on interdit, c'est qu'une part atterrisse chez
quelqu'un qui n'a pas franchi les contrôles d'entrée.

Conséquence assumée : l'émission de parts par le coffre n'est pas concernée, une
frappe n'étant pas un transfert. C'est cohérent avec le fait que le contrôle
d'éligibilité a lieu à l'entrée du produit, hors chaîne, avant même qu'un
portefeuille soit provisionné.

### Autorité de la liste

Une clé unique fixée à l'initialisation, distincte de l'administrateur du
coffre : mettre à jour une liste d'éligibilité et suspendre un coffre sont deux
gestes de nature différente, exercés par des personnes différentes. Le passage à
une signature multiple relève du chantier mainnet, comme sur la version Soroban.

## Tâches

**1. Ossature du programme et liste des comptes supplémentaires.** *Livrée le
31/07.* Identifiant `EGbJBdCUK5ecUiVJ9FFiGdVEZQ15cE31zNm97RUpFK63`, quatre
tests.

La liste est écrite au format que l'interface sait relire, vérifié en la
relisant **avec la bibliothèque d'interface elle-même** plutôt qu'avec un
décodage maison : ce qui compte est que Token-2022 la lise, pas que nous
sachions la décoder.

Deux points de fabrication à connaître. Le compte de la liste ne peut pas être
créé par une contrainte `init` : sa taille dépend du nombre de métadonnées, que
seule la bibliothèque sait calculer, donc la création se fait à la main dans le
gestionnaire. Et ses graines sont imposées par l'interface, Token-2022 les
dérivant lui-même pour la trouver.

Réserve inchangée, et écrite dans l'en-tête du fichier de tests : rien ici ne
prouve que la dérivation depuis les données du compte de destination désigne la
bonne entrée. Seul un vrai transfert le dira, puisque c'est Token-2022 qui
dérive. C'est la tâche 4.

**2. Gestion de la liste.** *Livrée le 31/07.* Autoriser et révoquer, autorité
uniquement, six tests.

Défaut trouvé par le test : la fermeture rend le dépôt à l'autorité, mais celle-ci
n'était pas déclarée modifiable. Le runtime refuse alors la transaction sur
« instruction changed the balance of a read-only account », un message qui ne
nomme pas le compte fautif. Sans un test qui révoque réellement, ce défaut
n'aurait été trouvé qu'en exploitation.

**3. `Execute`.** *Livrée le 31/07.*

La garde de transfert est éprouvée par un test qui appelle l'instruction
directement, avec **tous les comptes valides et un destinataire autorisé** :
seule la garde peut le faire échouer, et le refus attendu est vérifié par son
code d'erreur. Sans la garde, ce test passerait.

Deux vérifications s'ajoutent à la liste elle-même. L'entrée est revalidée par
ses graines dans la structure de comptes : si le drapeau de transfert venait à
être contournable, cette seconde barrière tiendrait encore. Et l'entrée est
**désérialisée entièrement** plutôt que testée pour son existence : un compte
détenu par ce programme mais d'un autre type passerait le seul test de
propriétaire, le discriminant ferme cette porte.

Le discriminant de l'instruction est celui de l'interface, pas celui d'Anchor :
c'est Token-2022 qui compose l'appel et il ne connaît que l'interface.
L'attribut `#[interface]` n'existe plus en Anchor 1.1.2, remplacé par un
`#[instruction(discriminator = ...)]`.

**Piège de harnais rencontré, corrigé dans les deux socles de test.** Deux
transactions identiques portent la même signature et la seconde est rejetée en
« AlreadyProcessed ». Un test de ré-autorisation après révocation échouait ainsi
pour une raison qui n'a rien à voir avec le programme. Le bloc de référence est
désormais avancé à chaque envoi.

**4. Les six cas du verdict S1.** *Livrée le 31/07.* **La réserve de méthode
est levée** : les conclusions tirées de la lecture du processeur sont désormais
éprouvées contre de vrais transferts, dans le simulateur.

Le cas 1 est celui qui prouve le plus : il valide la dérivation depuis les
données du compte de destination, ce qu'aucun test antérieur ne pouvait
affirmer, puisque c'est Token-2022 qui dérive.

**Un défaut trouvé, et il aurait été invisible.** Le cas 4 échouait bien, mais
sur un code de contrainte de propriétaire, pas sur le refus de la liste. La
structure de comptes exigeait que l'autorité de la source en soit le
propriétaire ; or lors d'un transfert **délégué**, Token-2022 passe le
délégataire en quatrième compte. Toute délégation était donc cassée, y compris
vers un destinataire autorisé, et le test ne pouvait pas le voir puisqu'il
attendait un échec.

Deux corrections. La contrainte est retirée, l'autorisation de l'autorité étant
de toute façon vérifiée par Token-2022 avant l'appel du hook : la revalider
était une garde dupliquée, donc une garde qui peut diverger. Et un test de
contre-épreuve est ajouté, qui exige qu'un transfert délégué vers un porteur
**autorisé** aboutisse. Sans lui, la même erreur se reproduirait sans bruit.

Leçon transposable : un test négatif qui n'exige pas le code d'erreur ne
distingue pas le refus voulu d'un accident, et un test négatif sans
contre-épreuve positive ne voit pas qu'on a tout cassé.

**5. Déploiement devnet et branchement au coffre.** *Déploiement fait le
31/07*, identifiant `EGbJBdCUK5ecUiVJ9FFiGdVEZQ15cE31zNm97RUpFK63`, preuves
dans [`evidence/compliance-hook.md`](../evidence/compliance-hook.md).

Le contrôle qui compte : le discriminant de l'instruction d'exécution publié
dans l'IDL est exactement `sha256("spl-transfer-hook-interface:execute")[0..8]`,
recalculé à part. Sans cette égalité, Token-2022 ne trouverait pas
l'instruction et le hook serait inerte tout en paraissant déployé.

Dimensionnement à une fois et demie le binaire, et non au double. Le coffre
avait été déployé à la taille exacte d'une ossature vide, ce qui a coûté 4,017
SOL d'agrandissement quand il s'est rempli ; le hook, lui, est fonctionnellement
complet, donc une marge au double aurait immobilisé de la place inutile.

**Reste le branchement** : attacher le hook à un mint réel, peupler une liste,
et initialiser un coffre qui le désigne. Cela demande un client capable de
composer ces instructions, donc la démonstration web. Ce n'est pas un manque du
module, c'est une dépendance d'outillage.

## Ce que ce chantier ne fait pas

Il ne connaît pas le coffre. Le hook gouverne un mint, quel qu'il soit, et
n'importe quel protocole peut le forker seul : c'est ce qui rend l'argument de
bien public vérifiable plutôt que déclaratif. Le coffre, symétriquement, ne sait
du hook que son identifiant, figé à son initialisation.

La suspension du coffre ne gèle pas les transferts de parts, décision prise et
motivée à la tâche 5 du coffre. La lier au hook coupleraient les deux programmes
que la conception sépare.
