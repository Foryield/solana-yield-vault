# Module de conformité Token-2022 — plan

Plan d'exécution du programme `compliance-hook`. Suppose lus la conception
(`2026-07-31-solana-yield-vault-design.md`, §3.2) et le verdict du spike S1.

| Version | Date | Changement |
|---|---|---|
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

**2. Gestion de la liste.** Autoriser et révoquer, autorité uniquement.

**3. `Execute`.** La garde `transferring`, la vérification de l'entrée, les
erreurs typées.

**4. Les six cas du verdict S1**, qui lèvent la réserve de méthode : transfert
vérifié autorisé, transfert vérifié refusé, transfert hérité, transfert par
délégataire vers un non-autorisé, fermeture de compte non vide, et ouverture
d'un compte sans l'extension requise.

**5. Déploiement devnet et branchement au coffre**, avec un coffre réinitialisé
sur l'identifiant réel du hook.

## Ce que ce chantier ne fait pas

Il ne connaît pas le coffre. Le hook gouverne un mint, quel qu'il soit, et
n'importe quel protocole peut le forker seul : c'est ce qui rend l'argument de
bien public vérifiable plutôt que déclaratif. Le coffre, symétriquement, ne sait
du hook que son identifiant, figé à son initialisation.

La suspension du coffre ne gèle pas les transferts de parts, décision prise et
motivée à la tâche 5 du coffre. La lier au hook coupleraient les deux programmes
que la conception sépare.
