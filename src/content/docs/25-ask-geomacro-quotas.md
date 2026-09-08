# 25. Ask Geomacro Access and Limits

**Status: LIVE PUBLIC INTERFACE**

Ask Geomacro is a grounded interface to stored Geomacro intelligence. The current answer engine does not call an external LLM or open-web search to manufacture an answer.

Current controls include:

- bounded question length
- input validation
- same-origin request protection
- relevance thresholds
- interpretation withheld when matching evidence is weak
- best-effort per-runtime request limiting

The current rate limiter is **not** represented as durable distributed quota enforcement. It is an application-level abuse control, not a commercial metering system.

Future paid access may introduce durable identity, shared quotas, usage metering and plan-specific limits. Those commercial quotas are **PLANNED** and must not be represented as live until implemented.