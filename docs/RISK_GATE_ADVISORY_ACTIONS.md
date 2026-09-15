# Risk Gate Advisory Action Semantics

Status: current Risk Gate v1 compatibility contract.

## Purpose

Risk Gate returns external geopolitical and macro risk context. It does not grant transaction permission or enforce the customer's downstream policy.

The v1 response contains both a `decision` and a compatibility field named `recommended_action`. These fields are advisory decision context. The authoritative execution boundary is always:

```text
execution_authorized = false
```

## Current v1 mapping

| Risk Gate decision | `recommended_action` | Meaning |
| --- | --- | --- |
| `CONTINUE` | `ALLOW` | No configured Risk Gate escalation was triggered by the supplied evaluation profile. This is not permission to execute. |
| `REDUCE_LIMIT` | `REDUCE_EXPOSURE` | Risk Gate recommends reduced exposure for the customer system to evaluate. |
| `REQUIRE_APPROVAL` | `REQUIRE_HUMAN_APPROVAL` | Risk Gate recommends escalation to the customer's approval process. |
| `PAUSE` | `BLOCK` | Risk Gate recommends that the customer system pause the proposed action. Geomacro does not itself block funds or execution. |

`ALLOW` and `BLOCK` are retained in v1 for compatibility. They must not be interpreted as authorization primitives.

## Consumer rule

A consuming system must treat the response in this order:

```text
verified Risk Gate advisory response
        -> customer identity + permissions + policy enforcement
        -> customer-controlled action
```

A caller-supplied policy profile may be evaluated inside the bounded Risk Gate request. That is an evaluation input only. Customer-side identity, permissions, policy ownership and enforcement, compliance obligations, funds and execution remain outside Geomacro's authority.

Consumers must not use `recommended_action="ALLOW"` as a standalone signal to submit a transaction. Any downstream action must remain under the customer's own authorization and policy system.

## Versioning rule

Changing the v1 `recommended_action` enum would be a machine-contract change. Any future replacement with less authorization-like labels should be introduced through an explicitly versioned contract rather than silently changing existing v1 values.
