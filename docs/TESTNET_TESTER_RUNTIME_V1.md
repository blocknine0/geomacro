# Code Scanning Cleanup Wave 2

This branch is reserved for remaining genuine CodeQL/code-scanning findings after the markdown-comment sanitization fix.

Priority order:

1. stack-trace / internal-error disclosure;
2. double escaping or unescaping in ingestion normalization;
3. unsafe HTML/DOM data flow where present;
4. remaining medium/low findings with concrete exploit or reliability impact.

High-entropy API-key SHA-256 lookup digests are not human-password hashes. They will be kept deterministic for indexed credential lookup unless a separate security defect is proven. Any such alert must be resolved with evidence rather than by replacing deterministic lookup with a password KDF.

No production deployment is authorized by this branch. Every code-scanning fix requires regression coverage and green Product CI / CodeQL before merge.
