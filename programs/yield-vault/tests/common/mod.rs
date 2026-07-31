//! Assistants partages par les tests d'integration LiteSVM.
//!
//! Ce module vit sous `tests/` et NON sous `src/` : `CARGO_TARGET_TMPDIR`
//! n'est defini que pour les cibles de test d'integration, et la bibliotheque
//! ne compile pas si elle y fait appel.

#![allow(dead_code)] // consomme des la premiere instruction (S1)

use std::path::PathBuf;

/// Lit le `.so` du programme, quel que soit le repertoire cible en vigueur.
///
/// L'ossature generee par `anchor init` code le chemin en dur :
///
/// ```ignore
/// include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/prog.so"))
/// ```
///
/// Ca marche sous `cargo test` et CASSE sous tout outil qui redirige le
/// repertoire cible. `cargo-llvm-cov` le fait (`--target-dir
/// target/llvm-cov-target`) : `CARGO_TARGET_TMPDIR` devient
/// `target/llvm-cov-target/tmp`, `../deploy` designe un repertoire vide, et la
/// compilation echoue sur un « No such file or directory » qui ne nomme pas sa
/// cause. `anchor build` ecrit TOUJOURS dans `<workspace>/target/deploy`.
///
/// Correction : lecture a l'EXECUTION plutot qu'a la compilation, les deux
/// emplacements essayes dans l'ordre. `include_bytes!` ne peut pas etre rendu
/// conditionnel, la macro exigeant un chemin litteral connu a la compilation.
pub fn program_binary(name: &str) -> Vec<u8> {
    let tmp = PathBuf::from(env!("CARGO_TARGET_TMPDIR"));
    let file = format!("{name}.so");
    // 1. cargo test     : <ws>/target/tmp/../deploy
    // 2. cargo llvm-cov : <ws>/target/llvm-cov-target/tmp/../../deploy
    let candidates = [
        tmp.join("..").join("deploy").join(&file),
        tmp.join("..").join("..").join("deploy").join(&file),
    ];
    for path in &candidates {
        if let Ok(bytes) = std::fs::read(path) {
            return bytes;
        }
    }
    panic!(
        "binaire {file} introuvable. Lancer `anchor build` d'abord. Chemins essayes : {}",
        candidates
            .iter()
            .map(|p| p.display().to_string())
            .collect::<Vec<_>>()
            .join(", ")
    );
}
