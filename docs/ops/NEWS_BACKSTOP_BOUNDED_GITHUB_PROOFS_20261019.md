# Bounded original D1 publisher job proof after real GH timeout

A real post-merge backstop run timed out while doing serial job lookups for up
to 10 green primary workflow runs. The cadence now inspects only the latest
three actual successful primary candidates, only in a bounded 3-hour window,
stops on a proven current writer, and treats an unavailable GH jobs endpoint
as UNPROVEN rather than a new source timestamp. Its existing single-writer,
idempotent D1 recovery remains safe to run. No private upstream payload.

Also fix the dedup path so a signed, real recovery is compared with proven
primary jobs ONLY, never a raw green-but-skipped GitHub workflow. The previous
raw workflow merging could reset a clock without any publication.
