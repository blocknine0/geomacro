# Existing three-domain source activation

Reuse the existing source lanes without restarting frozen Supabase writers.
Counts below overlap by provider and are not a total of independent sources.

| Existing lane | Execution |
| --- | --- |
| 13 public machine adapters | Existing daily schedule and manual run; every adapter attempted independently |
| 7 credentialed adapters | Existing four daily slots now reach the runtime job; missing credentials block only their own source |
| 10 P0 sources | New bounded private runtime in the existing P0 workflow: main changes, manual runs and one daily slot |
| 15 active official endpoints, 3 quarantined | Existing 90-minute official observer; quarantine retained |
| 10 operator candidates | All three groups on protected push or manual run; one rotating group per existing scheduled slot |
| 535 governed discovery roots | Existing bounded root rotation; website availability is not an article/feed adapter |

P0 private execution reuses the checked-in sanctions, mineral, policy and
international institution parsers. One source request, 15-second deadline,
2 MiB default response bound (32 MiB only for the exact UK sanctions XML,
observed at 22,051,272 bytes), no redirect following and no retries per source. Denial,
oversize, missing schema and parser failure remain individual unavailable
results. It never sends raw titles, URLs or publisher bodies to artifacts.
World Bank ZIP signature and UNCTAD HTML are explicitly transport/context
observations, not extracted dataset observations.

The commercial `enabled` flags in the P0 registry remain governed by their
original qualification contract. Existing parser dates, including imprecise
calendar dates, are never promoted to verified current publication clocks.
No new signing, rights authorization, API subscription, Telegram access,
Supabase network, B2 operation, payment or public signed-data publication is
introduced. Source references without a concrete connector, required account
or permission remain blocked rather than being marked live.
