# SEC EDGAR exact original filing identity (pilot)

The existing public-source adapter previously counted entries from one SEC submissions JSON index. This pilot follows one exact, recent, supported form from the first-party submissions index into the official SEC *complete submission* text archive. A 64KiB Range request reads only the native SEC header. The archive header must exactly agree on issuer accession, form and filing date with the original index. The result is a digest of that short header, not raw filing text.

Requests use official SEC hosts, an identified user agent and bounded time/data. Both requests must pass on the protected production workflow. A 403/429 remains a genuine upstream restriction, not a reason to bypass access controls.

A native filing date is not proof of a geopolitical event or original newspaper release. This does not fetch the complete document, identify material risks, assign an affected country, approve third-party rights, sign a Geomacro risk object or enable paid customers. All structured and source information is research-only, no Supabase, B2/D1 writes, payment or source text in customer output.

Run `node --test scripts/tests/sec-edgar-original-filing.test.mjs` for the regression suite. Production workflow: `SEC EDGAR native original filing verification`, sanitized 7-day GitHub receipt. Scope currently one pinned issuer, not SEC-wide.
