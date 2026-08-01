# Contributing

## Where the project stands

Design phase. No program is written, no toolchain is pinned, nothing is
deployed. The architecture is settled and reviewable; the next work is the
opening spikes, not program code.

Read these two documents before anything else. They are in French; the code and
its comments are in English.

- [`docs/plans/2026-07-31-solana-yield-vault-design.md`](./docs/plans/2026-07-31-solana-yield-vault-design.md):
  what is being built, why, and the devnet inventory it relies on.
- [`docs/plans/2026-07-31-spikes-ouverture.md`](./docs/plans/2026-07-31-spikes-ouverture.md):
  the seven questions that must be answered first.

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

Conventional prefix, then a body that explains the *why*, not the *what*: the
diff already says what changed. Written in French, without accents. Example:

```
feat(vault): parts proportionnelles et parts mortes au premier depot

Le ratio 1:1 rendait le coffre inutilisable des qu'une strategie fait
monter les actifs [...]
```

## Toolchain

`Anchor.toml` is the single source of truth for the version triple, and CI
fails if the workflow drifts from it. Do not install versions from the Anchor
installation page: it advertises an Agave release two major versions behind
what devnet actually runs.

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/v4.1.2/install)"   # Agave
# Anchor: prebuilt binary from the v1.1.2 release, or `avm install 1.1.2`
solana config set --url devnet   # the CLI defaults to mainnet-beta
```

That last line is not optional. The CLI ships pointing at mainnet-beta, and a
deploy command run by mistake there costs real SOL.

## Running the checks

```bash
anchor build          # must precede the tests: they load the .so
cargo test --workspace
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
```

## About program keypairs

`anchor build` generates a program keypair under `target/deploy/` when none
exists, and that directory is gitignored, and rightly so: it is key material.

Two consequences worth knowing before they bite:

**Nothing in the working tree carries a stable program id after a build.** On a
fresh clone `anchor build` mints new keypairs and then rewrites everything that
names an id to match them: `Anchor.toml`, and the `declare_id!` in the sources.

The committed IDL therefore carries **no address at all**: the sync script
strips it. An address is not part of an interface: instructions, accounts and
errors are. Deployed addresses live in `docs/evidence/`, which is written by
hand and never regenerated.

**Never read a program id from the IDL or from a post-build `Anchor.toml`**:
pass it explicitly. The client API requires it as an argument for exactly this
reason.

**A fresh clone cannot redeploy to the existing addresses.** The programs
already on devnet were deployed from keypairs that live on one machine only.
Losing them does not break upgrades (those need the upgrade authority, not the
program keypair), but it does make a from-scratch redeploy to the same
addresses impossible. Back them up outside the machine.

## About the coverage gate

CI enforces **100 % line coverage on the pure logic**, and nothing else. This
is not laxity, it is the only threshold that means anything here.

The programs execute as BPF inside the test simulator, so a host-side coverage
instrument never sees them: measured on a witness program, the BPF path returns
**zero per cent** while the same logic extracted into a pure function measures
fully. The repository total fell from 87 % to 46 % across five instructions
without a single line becoming untested. A threshold on that total would have
been loosened at every task until it guaranteed nothing.

The filter therefore names the files that only ever run in BPF, rather than
naming the pure module. A **new** pure module enters the measurement by
default; adding a handler to the filter is a visible decision in review, never
a silent omission.

