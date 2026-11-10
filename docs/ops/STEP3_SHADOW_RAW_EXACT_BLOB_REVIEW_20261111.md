# Exact-byte Step3 shadow raw-reader review (11 Nov 2026)
The guarded inventory rightfully blocked raw-json references after existing shadow file bytes changed.
Exact newly reviewed Git blob identities (not a global allowlist or bypass):
- scripts/lib/d1-step3-real-shadow-proofs.mjs: f0d7d77e0c5a24898e5b2cc442812f7a0070231a
- scripts/lib/d1-step3-shadow-pointer-seed.mjs: 75defeb8e4093d939dba83dda7abbb4526addec8
- scripts/ops/seed-step3-shadow-archived-original.mjs: 9b50142046703f4782919a2576415ecdf563fa4f

Real shadow parity proof: bounded one-original read; verifies Shadow D1 worker
binding and independent B2 GET. Shadow pointer seed: requires rehearsal flag,
non-production D1 database UUID and private R2 HMAC pointer. Real-shadow B2
seed: approved exact-main shadow-only; rejects equal production and shadow
D1 UUIDs and uses shadow UUID in the raw-json REST query.

These pins authorize only EXACT source bytes in shadow/isolated rehearsal.
They do not authorize production raw D1 readers, ignore canary holds,
certify commercial rights, claim B2 parity or enable customer billing.
Any subsequent changed bytes again fail the inventory review.
