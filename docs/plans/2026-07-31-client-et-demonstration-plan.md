# Client et démonstration - plan

Plan d'exécution du chantier qui rend les programmes utilisables et prouvables
contre le réseau. Suppose lus la conception et les journaux de preuves des deux
programmes.

| Version | Date | Changement |
|---|---|---|
| 1.4 | 2026-08-01 | Tâches 4 et 5 écrites ; hébergement tranché ; le dossier s'appelle `web/` et non `app/` |
| 1.3 | 2026-07-31 | Tâches 1 et 2 livrées : composition, lecture d'état et ligne de commande d'administration |
| 1.2 | 2026-07-31 | L'IDL commis ne porte plus d'adresse : rien dans l'arbre de travail n'en porte de stable après un build |
| 1.1 | 2026-07-31 | Tâche 1 livrée ; le plan sous-estimait un point : la dérivation d'adresses est INÉVITABLEMENT écrite deux fois, d'où les fixtures croisées |
| 1.0 | 2026-07-31 | Plan initial, 6 tâches |

---

## Pourquoi ce chantier passe avant tout le reste

Les deux programmes sont écrits, testés et déployés. Et pourtant **rien ne les a
jamais exercés contre le réseau** : aucun coffre initialisé sur devnet, aucun
mint gouverné par le hook, aucun dépôt. Tout le comportement vit dans un
simulateur en processus.

Ce n'est pas un défaut des programmes, c'est une dépendance d'outillage : les
instructions Anchor ne se composent pas à la main depuis une ligne de commande.
Or cette même dépendance bloque trois choses d'un coup.

Elle bloque la **preuve** : un identifiant de programme déployé ne prouve pas
qu'un dépôt fonctionne. Elle bloque la **démonstration** des dépôts sur les
mints réels de Circle, USDC et EURC, qui sont un engagement explicite. Et elle
bloque la **surface publique** sans laquelle personne d'autre que nous ne peut
essayer quoi que ce soit.

Un chantier qui lève trois blocages passe avant ceux qui n'en lèvent aucun.

## Décision d'architecture : une seule source de composition

Deux publics, deux surfaces, mais **un seul endroit qui sait composer les
instructions**.

Les opérations d'administration (attacher le hook à un mint, initialiser un
coffre, peupler la liste d'autorisation) exigent une clé qui n'a rien à faire
dans un navigateur. Les opérations de porteur (déposer, retirer) exigent au
contraire un portefeuille utilisateur. Ce sont deux contextes d'exécution
irréconciliables.

Deux options. Écrire l'outil d'administration en Rust et la démonstration en
TypeScript : chaque surface serait idiomatique, mais la dérivation des comptes,
les graines et l'ordre des arguments seraient écrits **deux fois**, dans deux
langages, avec deux occasions de diverger. Ou une bibliothèque TypeScript
partagée, consommée par une ligne de commande côté serveur et par la
démonstration côté navigateur.

**Retenu : la bibliothèque partagée.** L'IDL est généré par le build et
TypeScript le consomme sans transcription. Surtout, la dérivation d'un compte
programmé est exactement le genre de chose qu'on écrit juste une fois et faux
la seconde.

Découpage : `client/` porte la composition et la dérivation, `ops/` en fait une
ligne de commande pour l'administration, `web/` en fait la démonstration.

> **Corrigé le 2026-08-01** : ce plan annonçait `app/`. Le dossier s'appelle
> `web/`, comme dans le dépôt Soroban, parce que c'est ce que désigne le
> `rootDir` du blueprint Render et qu'un lecteur qui compare les deux dépôts
> publics doit y retrouver la même forme.

## Ce qui se compose, et ce qui ne se compose pas

Le dépôt et le retrait n'ont **pas** besoin des comptes supplémentaires du hook.
Une frappe et une destruction ne sont pas des transferts, donc Token-2022
n'invoque pas le hook. Seul un transfert de parts entre porteurs le déclenche,
et lui seul exige la résolution.

Conséquence pratique : la démonstration de dépôt et de retrait est simple, et
c'est la démonstration de **transfert entre porteurs** qui portera la valeur
d'illustration du contrôle d'éligibilité. Elle vient donc en dernier, une fois
le reste acquis.

## Tâches

**1. Bibliothèque de composition.** *Dérivation d'adresses livrée le 31/07*,
six tests. La construction des instructions et la lecture d'état suivent.

**Le plan sous-estimait un point.** « Une seule source de composition » vaut
pour les trois surfaces TypeScript, mais la dérivation d'adresses est
inévitablement écrite **deux fois** : les programmes la font en Rust dans leurs
contraintes de comptes, le client la refait en TypeScript. Il n'y a pas moyen de
l'éviter, seulement de la surveiller.

D'où les fixtures croisées : les tests Rust figent les adresses attendues pour
un mint fixe, les tests TypeScript relisent le même fichier et comparent à leur
propre dérivation. Les deux implémentations sont confrontées à chaque exécution
plutôt que supposées d'accord. Éprouvé par mutation : une lettre retirée à une
graine fait tomber le test, là où le défaut ne serait apparu à l'exécution que
sous forme d'un compte introuvable, l'un des symptômes les plus opaques de
Solana.

Les IDL sont **commis** dans le paquet, un navigateur ne pouvant pas lire
`target/` qui est ignoré par git. Un fichier commis dérive, donc un contrôle
dédié échoue si le dépôt ne correspond plus aux programmes, et l'intégration
continue l'exerce. Même motif que le contrôle d'alignement des versions.

**2. Ligne de commande d'administration.** *Livrée le 31/07*, cinq commandes,
dix tests.

Deux garde-fous, tous deux testés sur ce qu'ils **refusent**. Rien n'est déduit
de l'environnement : sans point d'accès, sans identifiants de programme ou sans
chemin de clé, la commande s'arrête en expliquant pourquoi. Et viser le mainnet
exige une confirmation explicite, parce que le CLI Solana y pointe par défaut et
qu'une commande d'administration qui en hériterait dépenserait du SOL réel sur
un geste qu'on croyait de test.

Le programme de jeton de l'actif est **lu on-chain** plutôt que supposé : USDC
et EURC devnet sont du SPL classique, mais rien ne l'impose à un autre actif.

Éprouvée contre devnet : la lecture d'état rend les mêmes adresses que les
fixtures, ce qui confronte une troisième fois la dérivation TypeScript à celle
des programmes, cette fois via le réseau.

**3. La preuve devnet.** C'est le but du chantier. Un coffre initialisé sur
l'USDC réel de Circle, un dépôt, un retrait, signatures consignées. Puis la même
chose sur EURC, qui est l'actif visé en production.

**4 et 5. Démonstration web, transfert et refus compris.** *Écrites le 01/08*,
dix-huit tests. Les deux tâches sont tenues d'un bloc : sans le transfert, la
démonstration montre un coffre quelconque.

L'hébergement, qui restait à trancher, l'est : **Render, sous-domaine
`solana.for-yield.com`**, même recette que la démonstration Soroban. Le service
et le domaine restent à créer à la main.

Trois points que le plan ne pouvait pas prévoir et qui ont coûté du temps. La
globale `Buffer` est absente du navigateur et la bibliothèque de composition
s'en sert dès le chargement de son module : le combler à l'exécution arrive trop
tard, il faut l'injecter à la construction. L'adaptateur de portefeuille tire
`react-native` et avec lui une seconde version des types de React, ce qui rend
tout composant de bibliothèque invalide comme élément JSX tant qu'une version
unique n'est pas imposée. Et le paquet client, lié en `file:`, doit être
installé explicitement avant le consommateur, sur Render comme en intégration
continue.

Un test a trouvé un défaut que la lecture n'aurait pas vu : la traduction d'un
refus retenait la dernière ligne de journal, qui est celle de Token-2022
propageant le code, et non celle du programme fautif. Le motif s'affichait donc
en clair dans le cas courant et en `[object Object]` dès qu'un journal ne
portait pas la ligne de message.

**6. Provisionnement sans portefeuille.** Le parcours où l'utilisateur ne
manipule ni extension ni phrase de récupération, sur le modèle du paquet
équivalent du dépôt Soroban : quatre briques indépendantes, chacune imprimant
une ligne JSON, appelables en sous-processus depuis n'importe quel dorsal.

## Contraintes d'exploitation à ne pas découvrir en route

**Le SOL devnet est rare.** Le solde est de 3,29 SOL et le robinet plafonne à
deux requêtes par tranche de huit heures. Initialiser un coffre crée quatre
comptes, ce qui coûte peu, mais une campagne de plusieurs dizaines de
portefeuilles demande une trésorerie et un script de distribution. C'est le
spike S6, qui redevient d'actualité.

**Les actifs de test aussi.** Le robinet de Circle est limité par adresse : on
l'appelle une fois vers une trésorerie et on distribue depuis là.

**Le CLI Solana pointe par défaut sur le mainnet.** Toute la ligne de commande
d'administration doit exiger le réseau explicitement plutôt que d'hériter d'une
configuration ambiante.

## Ce que ce chantier ne fait pas

L'allocateur et le schéma d'événements. Le coffre reste un coffre de garde pure :
la stratégie se branchera derrière l'interface de dépôt et de retrait sans
casser le ratio de parts, comme sur la version Soroban.
