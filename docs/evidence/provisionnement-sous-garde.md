# Provisionnement sous garde - déposer sans extension ni phrase de récupération

## 2026-08-02 - La chaîne complète tient, du portefeuille créé au dépôt confirmé

**Ce que ça prouve** : un utilisateur qui ne manipule ni extension de
navigateur ni phrase de récupération peut déposer dans le coffre. Le
portefeuille est créé par le fournisseur de garde à partir d'un simple
identifiant, il signe sur demande, et sa clé ne quitte jamais le fournisseur.

C'est le critère de sortie du spike **S5**, rendu du premier coup.

**Cluster** : Solana **devnet**. **Environnement du fournisseur** :
`SolanaDevnet`, seule valeur que le paquet demande, figée dans le code.

| Élément | Valeur |
|---|---|
| Identifiant du parcours | `preuve-s5-2026-08-02` |
| Portefeuille chez le fournisseur | `wa-01jv0-vchi9-e1e85jpj3ck4btak` |
| Adresse Solana | `4DMesL4kga7dLWwiY1vutBpGnALya39fwaAQ2ohv5HZq` |
| Dotation par la trésorerie | `4uza636FdXey2z4nZs4xtvvp1FysW746D7qmXE1nTaUvuhqKzj7RGB5xmgR4g8duM4arJoK95DcGuuyHDi7YCNsJ` |
| Dépôt signé par la garde | `wNkPoyRByUSFwrLKRNfqWrSbRpizvD1scjfuVeBooMqet7yn3KttW1LHZBaSfuw73JcYj4RacdAzWdDbY8F5uYK` |
| Slot | 480657110 |
| Montant | 0,5 USDC |

[Voir le dépôt sur l'explorateur](https://explorer.solana.com/tx/wNkPoyRByUSFwrLKRNfqWrSbRpizvD1scjfuVeBooMqet7yn3KttW1LHZBaSfuw73JcYj4RacdAzWdDbY8F5uYK?cluster=devnet)

### Relu contre le réseau, pas contre la sortie de la commande

La commande imprime son propre résumé ; elle n'est pas la preuve. Les quatre
faits ci-dessous ont été relus par des appels indépendants au réseau.

Le compte de parts de l'adresse porte **0,5 part** du mint
`4R5iTggafNoLwo4KDQsPS8981eqeFw35gUB2JDm6Q5ps`, et son compte USDC est retombé
à **zéro** : l'actif est bien entré au coffre et la frappe a bien eu lieu.

La transaction rend `err: null` et ses journaux nomment l'instruction
`Deposit` du programme du coffre.

**Le signataire de la transaction est l'adresse du portefeuille sous garde
elle-même.** C'est le fait qui porte tout : nous n'avons jamais tenu cette clé.

Son solde vaut 0,009995 SOL, soit la dotation de 0,01 moins les 5 000 lamports
de frais : le portefeuille a payé sa propre transaction.

### Ce que le parcours a consommé

Une transaction de dotation signée par la trésorerie, portant le transfert de
SOL, l'ouverture des deux comptes de jeton du bénéficiaire et le transfert
d'actif. Puis une transaction de dépôt signée par la garde. Deux transactions,
0,01 SOL et 0,5 USDC prélevés sur la trésorerie.

### Ce qui aurait cassé, et qui a été corrigé avant l'essai

Deux défauts trouvés en lisant les types du fournisseur plutôt qu'en découvrant
leurs effets, et un troisième en écoutant une objection.

**Une demande de diffusion est asynchrone.** Elle rend `Pending`, `Executing`,
`Broadcasted`, `Confirmed`, `Failed` ou `Rejected`. La brique exigeait
`Broadcasted` dès la réponse initiale, transposé du dépôt Stellar où cela
suffit ; elle aurait accusé la garde de ne pas avoir diffusé alors qu'elle
était en train de le faire. Elle relit maintenant la demande jusqu'à un état
terminal. Ces états de passage deviendront la règle le jour où une politique
d'approbation encadrera les diffusions.

**Le contrôle d'environnement ne pouvait pas porter sur l'URL.** Le fournisseur
n'a pas d'API de bac à sable : un seul hôte sert le mainnet et les réseaux de
test. Le verrou porte donc sur le réseau demandé, constant dans le code, et sur
l'empreinte de genèse de la chaîne, lue avant tout geste.

**L'identifiant de credential n'avait pas à être réclamé.** Le défi du
fournisseur porte lui-même la liste des credentials autorisés ; le signataire du
paquet l'y lit. Une valeur de moins à saisir, et une dépendance de moins.

### Réserves, écrites plutôt que tues

La trésorerie dote chaque portefeuille en SOL. Cela tient pour une
démonstration, pas au delà : la forme visée est un payeur de frais distinct du
signataire, qui évite à l'utilisateur d'avoir à détenir du SOL.

Le nom du portefeuille est l'identifiant brut. Ici c'est une chaîne technique ;
dans un usage réel ce nom serait une donnée personnelle et devrait être traité
comme telle.

Le portefeuille ci-dessus est un **artefact de preuve**, pas un portefeuille
orphelin : il est nommé, daté, et il détient les 0,5 part qu'il a reçues.
