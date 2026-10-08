# 48. Status Labels

Geomacro uses a small, explicit status vocabulary across public commercial surfaces.

## LIVE

Available in the current public product.

## PRIVATE PILOT

Implemented capability available only through controlled customer access, with validation and operating controls still being hardened.

## PRODUCTION GATED

Commercial capability whose runtime remains fail-closed until explicit production activation and required acceptance gates pass.

## PLANNED / COMING SOON

A roadmap or commercial direction that is not currently available. Customer-facing pages may display **Coming Soon**; no working checkout, entitlement or production service should be implied. **Coming Soon** can also describe general access for a production-gated or Private Pilot feature, while its actual gate remains visible.

## LEGACY

Older implementation retained internally for compatibility or reproducibility and not presented as a customer product.

Status must describe the actual product state. Code existence alone does not justify `LIVE`, and `PRIVATE PILOT` does not imply a production SLA or institutional deployment.
