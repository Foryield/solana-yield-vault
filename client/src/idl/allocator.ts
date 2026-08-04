/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/allocator.json`.
 */
export type Allocator = {
  "address": "11111111111111111111111111111111",
  "metadata": {
    "name": "allocator",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Allocateur : place l'actif d'un coffre sur des venues de rendement"
  },
  "instructions": [
    {
      "name": "deposerJupiterLend",
      "docs": [
        "Depose `actif` unites sur Jupiter Lend depuis la position du coffre.",
        "",
        "Le plancher n'est PAS un argument : il est calcule sur la chaine, apres",
        "rafraichissement des prix, par le module d'arithmetique deja mesure",
        "contre le marche reel. Le faire venir de l'exterieur laisserait un",
        "appelant desarmer la protection en passant zero."
      ],
      "discriminator": [
        189,
        7,
        174,
        6,
        15,
        144,
        8,
        23
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "SEUL HABILITE. L'etape 1 acceptait n'importe quel signataire, ce qui ne",
            "permettait aucun vol mais laissait un tiers decider quand nos fonds",
            "bougeaient."
          ],
          "signer": true,
          "relations": [
            "configuration"
          ]
        },
        {
          "name": "configuration",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103,
                  117,
                  114,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              }
            ]
          }
        },
        {
          "name": "position",
          "docs": [
            "Position, a l'adresse meme qui signe les invocations croisees.",
            "",
            "Les trois `has_one` remplacent autant de verifications ecrites a la main",
            "dans le corps du gestionnaire a l'etape 1. L'actif et le jeton de recu",
            "ont ete lus dans le marche a l'ouverture et figes : plus rien ne peut",
            "presenter un mint qui n'est pas celui de cette position."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position.coffre",
                "account": "position"
              },
              {
                "kind": "account",
                "path": "position.marche",
                "account": "position"
              }
            ]
          }
        },
        {
          "name": "marche",
          "docs": [
            "Compte de marche de la venue, decode par `lire_marche` APRES le",
            "rafraichissement des prix.",
            "verifiee par le `has_one` de la position."
          ],
          "writable": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "actifDeLaPosition",
          "docs": [
            "Actif detenu par la position, source du depot."
          ],
          "writable": true
        },
        {
          "name": "recuDeLaPosition",
          "docs": [
            "Jetons de recu detenus par la position, destination du depot. C'est le",
            "solde de CE compte qui mesure ce que la venue a reellement emis, et sur",
            "lui que le plafond est verifie."
          ],
          "writable": true
        },
        {
          "name": "actif",
          "relations": [
            "position"
          ]
        },
        {
          "name": "jetonDeRecu",
          "writable": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "administration"
        },
        {
          "name": "reservesDeLiquidite",
          "writable": true
        },
        {
          "name": "positionDeLiquidite",
          "writable": true
        },
        {
          "name": "modeleDeTaux"
        },
        {
          "name": "coffreDeLaVenue",
          "writable": true
        },
        {
          "name": "liquidite",
          "writable": true
        },
        {
          "name": "programmeDeLiquidite",
          "writable": true
        },
        {
          "name": "modeleDeRecompenses"
        },
        {
          "name": "programmeDePret"
        },
        {
          "name": "programmeDeJeton"
        },
        {
          "name": "programmeDeCompteAssocie"
        },
        {
          "name": "programmeSysteme"
        }
      ],
      "args": [
        {
          "name": "actif",
          "type": "u64"
        }
      ]
    },
    {
      "name": "fermerPosition",
      "docs": [
        "Ferme une position vide et rend son depot de non-expiration.",
        "",
        "Sert aussi de chemin de migration : une position ecrite par une version",
        "anterieure du programme ne se relit pas par la suivante si sa",
        "disposition a change. Fermer puis rouvrir est alors le chemin le plus",
        "court, et il est sans risque des lors que la position est sortie."
      ],
      "discriminator": [
        83,
        9,
        67,
        213,
        146,
        0,
        95,
        88
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "configuration"
          ]
        },
        {
          "name": "configuration",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103,
                  117,
                  114,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              }
            ]
          }
        },
        {
          "name": "coffre"
        },
        {
          "name": "marche"
        },
        {
          "name": "position",
          "docs": [
            "LA POSITION N'EST PAS DESERIALISEE ICI, et c'est tout l'objet de ce",
            "geste. Une position ecrite par une version anterieure du programme ne se",
            "relit pas par la suivante des lors que sa disposition a change : la lire",
            "pour la fermer rendrait la fermeture impossible exactement dans le cas ou",
            "elle sert. Les graines suffisent a garantir qu'il s'agit bien d'elle.",
            "volontairement ignore."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "coffre"
              },
              {
                "kind": "account",
                "path": "marche"
              }
            ]
          }
        },
        {
          "name": "recuDeLaPosition",
          "docs": [
            "Jetons de recu de la position. LU POUR EXIGER QU'ELLE SOIT SORTIE :",
            "fermer la gouvernance d'une position qui detient encore une exposition la",
            "rendrait orpheline, gerable par personne."
          ]
        }
      ],
      "args": []
    },
    {
      "name": "initialiser",
      "docs": [
        "Fige l'administrateur de l'allocateur. Appelable une seule fois."
      ],
      "discriminator": [
        66,
        231,
        132,
        19,
        144,
        136,
        124,
        102
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "configuration",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103,
                  117,
                  114,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "ouvrirPosition",
      "docs": [
        "Ouvre une position sur un couple coffre et marche, avec son plafond."
      ],
      "discriminator": [
        226,
        104,
        133,
        189,
        221,
        75,
        241,
        129
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "configuration"
          ]
        },
        {
          "name": "configuration",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103,
                  117,
                  114,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              }
            ]
          }
        },
        {
          "name": "coffre"
        },
        {
          "name": "marche",
          "docs": [
            "Compte de marche de la venue. Decode ICI pour en tirer l'actif et le",
            "jeton de recu, qui sont ensuite FIGES dans la position : les relire a",
            "chaque mouvement laisserait une chance de presenter un autre marche."
          ]
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "coffre"
              },
              {
                "kind": "account",
                "path": "marche"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "plafond",
          "type": "u64"
        },
        {
          "name": "toleranceBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "racheterTout",
      "docs": [
        "CHEMIN D'URGENCE. Brule l'integralite du solde de jetons de recu.",
        "",
        "Aucun argument : ni montant, la position sort en entier, ni borne, elle",
        "est calculee sur la chaine depuis la valorisation du solde. C'est ce qui",
        "le rend utilisable sous incident, ou l'on ne veut ni valoriser d'abord ni",
        "se tromper de chiffre. Reste ouvert quand la position est suspendue : une",
        "suspension protege des depots, elle n'enferme pas les fonds."
      ],
      "discriminator": [
        73,
        62,
        171,
        160,
        16,
        184,
        87,
        57
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "configuration"
          ]
        },
        {
          "name": "configuration",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103,
                  117,
                  114,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position.coffre",
                "account": "position"
              },
              {
                "kind": "account",
                "path": "position.marche",
                "account": "position"
              }
            ]
          }
        },
        {
          "name": "marche",
          "docs": [
            "verifiee par le `has_one` de la position."
          ],
          "writable": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "actifDeLaPosition",
          "docs": [
            "Actif detenu par la position, destination de la sortie."
          ],
          "writable": true
        },
        {
          "name": "recuDeLaPosition",
          "docs": [
            "Jetons de recu detenus par la position, source de la sortie."
          ],
          "writable": true
        },
        {
          "name": "actif",
          "relations": [
            "position"
          ]
        },
        {
          "name": "jetonDeRecu",
          "writable": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "administration"
        },
        {
          "name": "reservesDeLiquidite",
          "writable": true
        },
        {
          "name": "positionDeLiquidite",
          "writable": true
        },
        {
          "name": "modeleDeTaux"
        },
        {
          "name": "coffreDeLaVenue",
          "writable": true
        },
        {
          "name": "compteDeReclamation",
          "docs": [
            "COMPTE DE RECLAMATION, propre aux sorties. Derive de l'administration de",
            "la venue et non du retireur, malgre une graine qui dit « user » : il en",
            "existe un seul par actif, et celui de l'USDC devnet existait deja."
          ],
          "writable": true
        },
        {
          "name": "liquidite",
          "writable": true
        },
        {
          "name": "programmeDeLiquidite",
          "writable": true
        },
        {
          "name": "modeleDeRecompenses"
        },
        {
          "name": "programmeDePret"
        },
        {
          "name": "programmeDeJeton"
        },
        {
          "name": "programmeDeCompteAssocie"
        },
        {
          "name": "programmeSysteme"
        }
      ],
      "args": []
    },
    {
      "name": "reglerPlafond",
      "docs": [
        "Regle le plafond de protocole, qui borne la VALORISATION de la position."
      ],
      "discriminator": [
        102,
        18,
        137,
        123,
        208,
        1,
        209,
        76
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "configuration"
          ]
        },
        {
          "name": "configuration",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103,
                  117,
                  114,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position.coffre",
                "account": "position"
              },
              {
                "kind": "account",
                "path": "position.marche",
                "account": "position"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "plafond",
          "type": "u64"
        }
      ]
    },
    {
      "name": "reglerTolerance",
      "docs": [
        "Regle la tolerance des bornes de sortie, en dix-milliemes."
      ],
      "discriminator": [
        252,
        232,
        64,
        23,
        189,
        254,
        197,
        143
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "configuration"
          ]
        },
        {
          "name": "configuration",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103,
                  117,
                  114,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position.coffre",
                "account": "position"
              },
              {
                "kind": "account",
                "path": "position.marche",
                "account": "position"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "toleranceBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "retirerJupiterLend",
      "docs": [
        "Retire `actif` unites de Jupiter Lend.",
        "",
        "AUCUNE BORNE N'EST PASSEE : depuis que la conversion inverse a ete",
        "mesuree, le 04/08 sur deux retraits reels, le plafond de parts est",
        "calcule sur la chaine et majore de la tolerance de la position. C'etait",
        "une dette nommee de l'etape 1, elle est soldee."
      ],
      "discriminator": [
        159,
        47,
        138,
        61,
        195,
        82,
        120,
        225
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "configuration"
          ]
        },
        {
          "name": "configuration",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103,
                  117,
                  114,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position.coffre",
                "account": "position"
              },
              {
                "kind": "account",
                "path": "position.marche",
                "account": "position"
              }
            ]
          }
        },
        {
          "name": "marche",
          "docs": [
            "verifiee par le `has_one` de la position."
          ],
          "writable": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "actifDeLaPosition",
          "docs": [
            "Actif detenu par la position, destination de la sortie."
          ],
          "writable": true
        },
        {
          "name": "recuDeLaPosition",
          "docs": [
            "Jetons de recu detenus par la position, source de la sortie."
          ],
          "writable": true
        },
        {
          "name": "actif",
          "relations": [
            "position"
          ]
        },
        {
          "name": "jetonDeRecu",
          "writable": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "administration"
        },
        {
          "name": "reservesDeLiquidite",
          "writable": true
        },
        {
          "name": "positionDeLiquidite",
          "writable": true
        },
        {
          "name": "modeleDeTaux"
        },
        {
          "name": "coffreDeLaVenue",
          "writable": true
        },
        {
          "name": "compteDeReclamation",
          "docs": [
            "COMPTE DE RECLAMATION, propre aux sorties. Derive de l'administration de",
            "la venue et non du retireur, malgre une graine qui dit « user » : il en",
            "existe un seul par actif, et celui de l'USDC devnet existait deja."
          ],
          "writable": true
        },
        {
          "name": "liquidite",
          "writable": true
        },
        {
          "name": "programmeDeLiquidite",
          "writable": true
        },
        {
          "name": "modeleDeRecompenses"
        },
        {
          "name": "programmeDePret"
        },
        {
          "name": "programmeDeJeton"
        },
        {
          "name": "programmeDeCompteAssocie"
        },
        {
          "name": "programmeSysteme"
        }
      ],
      "args": [
        {
          "name": "actif",
          "type": "u64"
        }
      ]
    },
    {
      "name": "suspendre",
      "docs": [
        "Suspend ou reprend la position. Ne bloque que les depots."
      ],
      "discriminator": [
        161,
        94,
        141,
        64,
        145,
        147,
        253,
        63
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "configuration"
          ]
        },
        {
          "name": "configuration",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103,
                  117,
                  114,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position.coffre",
                "account": "position"
              },
              {
                "kind": "account",
                "path": "position.marche",
                "account": "position"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "suspendue",
          "type": "bool"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "configuration",
      "discriminator": [
        192,
        79,
        172,
        30,
        21,
        173,
        25,
        43
      ]
    },
    {
      "name": "position",
      "discriminator": [
        170,
        188,
        143,
        228,
        122,
        64,
        247,
        208
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "marcheTailleInattendue",
      "msg": "Le compte de marche n'a pas la taille attendue"
    },
    {
      "code": 6001,
      "name": "marcheDiscriminateurInattendu",
      "msg": "Le compte de marche porte un autre discriminateur"
    },
    {
      "code": 6002,
      "name": "marcheActifEtranger",
      "msg": "Le marche ne porte pas l'actif annonce"
    },
    {
      "code": 6003,
      "name": "marcheJetonEtranger",
      "msg": "Le marche ne porte pas le jeton de recu annonce"
    },
    {
      "code": 6004,
      "name": "montantNul",
      "msg": "Le montant depose doit etre positif"
    },
    {
      "code": 6005,
      "name": "prixNul",
      "msg": "Un prix d'echange du marche vaut zero"
    },
    {
      "code": 6006,
      "name": "debordement",
      "msg": "Debordement arithmetique"
    },
    {
      "code": 6007,
      "name": "partsInsuffisantes",
      "msg": "La venue a emis moins de parts que la conversion n'en promettait"
    },
    {
      "code": 6008,
      "name": "actifInsuffisant",
      "msg": "La venue a rendu moins d'actif que le retrait n'en demandait"
    },
    {
      "code": 6009,
      "name": "partsBruleesExcessives",
      "msg": "La venue a brule plus de parts que le plafond ne l'autorisait"
    },
    {
      "code": 6010,
      "name": "actifPreleveExcessif",
      "msg": "La venue a preleve plus d'actif que le depot n'en offrait"
    },
    {
      "code": 6011,
      "name": "soldeIncoherent",
      "msg": "Le solde d'un compte de la position a varie dans le sens que l'operation interdit"
    },
    {
      "code": 6012,
      "name": "positionSuspendue",
      "msg": "La position est suspendue : aucun depot n'est accepte"
    },
    {
      "code": 6013,
      "name": "plafondDepasse",
      "msg": "Ce depot porterait la valorisation de la position au-dela de son plafond"
    },
    {
      "code": 6014,
      "name": "positionVide",
      "msg": "La position ne detient aucun jeton de recu : il n'y a rien a racheter"
    },
    {
      "code": 6015,
      "name": "rachatIncomplet",
      "msg": "Le rachat integral a laisse des jetons de recu derriere lui"
    },
    {
      "code": 6016,
      "name": "toleranceAberrante",
      "msg": "Tolerance aberrante : au-dela du plafond, une borne ne borne plus rien"
    },
    {
      "code": 6017,
      "name": "marchePerime",
      "msg": "Le marche n'a pas ete rafraichi dans cette transaction"
    },
    {
      "code": 6018,
      "name": "positionNonSortie",
      "msg": "La position detient encore une exposition : la fermer la rendrait orpheline"
    },
    {
      "code": 6019,
      "name": "marcheDeLaPositionEtranger",
      "msg": "Le marche presente n'est pas celui que la position a fige a son ouverture"
    }
  ],
  "types": [
    {
      "name": "configuration",
      "docs": [
        "Qui a le droit d'agir sur les positions de cet allocateur.",
        "",
        "PROPRE A L'ALLOCATEUR PLUTOT QU'EMPRUNTEE AU COFFRE, et c'est un choix",
        "argumente. Lire l'administrateur dans le compte du coffre donnerait une",
        "source unique, mais recreerait le couplage que la conception a defait en",
        "separant les deux programmes : l'allocateur dependrait de la disposition",
        "d'un compte qu'il ne possede pas, et un changement du coffre le casserait en",
        "silence.",
        "",
        "Le prix est assume : « qui gouverne cet actif » existe des lors a deux",
        "endroits, et rien n'oblige les deux a concorder. C'est une divergence a",
        "surveiller en exploitation, pas une impossibilite."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "docs": [
              "Seul habilite a ouvrir une position, regler son plafond, la suspendre et",
              "declencher un retrait integral."
            ],
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "position",
      "docs": [
        "Ce qui est permis sur un couple coffre et marche.",
        "",
        "CE COMPTE VIT A L'ADRESSE QUI SIGNE LES INVOCATIONS CROISEES. L'etape 1 n'y",
        "attachait aucune donnee : l'adresse ne servait qu'a signer et a detenir les",
        "comptes de jeton. Elle porte desormais l'etat, sans changer d'adresse, donc",
        "sans invalider les comptes de jeton deja crees."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "coffre",
            "docs": [
              "Coffre servi. Redondant avec la graine, et conserve pour qu'un lecteur",
              "hors chaine sache de quoi parle ce compte sans redériver l'adresse."
            ],
            "type": "pubkey"
          },
          {
            "name": "marche",
            "docs": [
              "Marche de la venue."
            ],
            "type": "pubkey"
          },
          {
            "name": "actif",
            "docs": [
              "Actif place. Fige a l'ouverture : le marche le declare, et un marche ne",
              "change pas d'actif."
            ],
            "type": "pubkey"
          },
          {
            "name": "jetonDeRecu",
            "docs": [
              "Jeton de recu de la venue, fige a l'ouverture pour la meme raison."
            ],
            "type": "pubkey"
          },
          {
            "name": "plafond",
            "docs": [
              "PLAFOND DE PROTOCOLE, en unites d'actif, porte sur la VALORISATION de la",
              "position et non sur le cumul depose.",
              "",
              "Les interets peuvent porter la valorisation au-dessus de ce plafond sans",
              "aucun geste de notre part. Cela bloque alors les nouveaux depots et ne",
              "force rien a sortir : un plafond dit ce qu'on accepte d'exposer de plus,",
              "il n'ordonne pas de liquider."
            ],
            "type": "u64"
          },
          {
            "name": "toleranceBps",
            "docs": [
              "TOLERANCE DES BORNES DE SORTIE, en dix-milliemes.",
              "",
              "Les bornes des sorties sont calculees sur la chaine depuis la conversion",
              "de la venue, MESUREE le 04/08 sur deux retraits reels. Les poser",
              "exactement reproduirait la faute que ce dessin reproche a l'egalite",
              "stricte : un changement d'arrondi chez un tiers deviendrait une panne",
              "totale de nos sorties, alors que rien n'aurait ete vole.",
              "",
              "Cette tolerance est donc l'ecart qu'on accepte entre leur arithmetique et",
              "la notre. Elle est GOUVERNEE et non codee en dur, au meme titre que le",
              "plafond : c'est une decision visible et revisable, pas une constante",
              "oubliee dans un fichier."
            ],
            "type": "u16"
          },
          {
            "name": "suspendue",
            "docs": [
              "Coupe-circuit de la position. Suspendre bloque les nouveaux depots sans",
              "rien deplacer ; retraits et retrait integral restent ouverts, sans quoi",
              "la suspension enfermerait les fonds au lieu de les proteger."
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
