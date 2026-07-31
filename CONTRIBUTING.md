# Contributing

## Where the project stands

Design phase. No program is written, no toolchain is pinned, nothing is
deployed. The architecture is settled and reviewable; the next work is the
opening spikes, not program code.

Read these two documents before anything else. They are in French; the code and
its comments are in English.

- [`docs/plans/2026-07-31-solana-yield-vault-design.md`](./docs/plans/2026-07-31-solana-yield-vault-design.md)
  — what is being built, why, and the devnet inventory it relies on.
- [`docs/plans/2026-07-31-spikes-ouverture.md`](./docs/plans/2026-07-31-spikes-ouverture.md)
  — the seven questions that must be answered first.

## Picking up work

Take a spike, not a feature. **S1, S2 and S3 are blocking and ordered**: nothing
should be written before each has returned a written verdict.

- **S1** decides whether the compliance module holds at all. If a transfer path
  bypasses the hook, the allowlist is worthless and the architecture changes.
- **S2** decides what quality guarantee the CI can enforce.
- **S3** pins the Anchor, Agave and Rust versions and produces the first
  deployment.

S4 through S7 run in parallel afterwards, and are independent of one another.

Announce which spike you are taking in an issue before starting, so two people
do not answer the same question twice.

## Rules

**Write the plan before the code.** Anything beyond a one-line fix gets a
document in `docs/plans/` first, dated, naming the alternatives considered and
why one was chosen. A design that only exists in a pull request description is a
design nobody can review later.

**Everything goes through a merged pull request**, never a direct push to `main`.

**Record proofs the day they are produced.** A deployment, a devnet transaction,
a working integration: it lands in `docs/evidence/` the same day, with its
signature and its cluster named. Proofs reconstructed weeks later are worth
nothing, because nobody can tell what was actually run.

**Name the cluster, always.** A proof produced on a mainnet-forked local
validator is never presented as a devnet proof. This is not pedantry: several
venues this project integrates behave differently across clusters, and one of
them (Jupiter Swap) does not exist on devnet at all.

**Verify, do not deduce.** Every address and every account count in the design
document was read on-chain, not copied from documentation. Protocol docs and
their deployed reality diverge routinely on Solana. `getAccountInfo` tells you
in one call whether an address is an executable program or a System-owned
account squatting the name.

**No key material, ever.** Not in files, not in tests, not in evidence, not even
for devnet. `.gitignore` covers the usual keypair names; that is a safety net,
not a permission.

## Commits

Conventional prefix, then a body that explains the *why*, not the *what* — the
diff already says what changed. Written in French, without accents. Example:

```
feat(vault): parts proportionnelles et parts mortes au premier depot

Le ratio 1:1 rendait le coffre inutilisable des qu'une strategie fait
monter les actifs [...]
```

## Toolchain

Not pinned yet — that is S3's job. Do not install versions from the Anchor
installation page without checking them against the live devnet runtime: that
page currently advertises an Agave version several major releases behind.

Once S3 lands, `Anchor.toml` is the single source of truth for the version
triple, and this section will point at it.
