// Owner-selected source verification window, shared by all three news domains.
// This does not extend a signed permission, the 72h journal retention, or the
// separate <=60-minute original-release freshness criterion.
export const ORIGINAL_VERIFICATION_WINDOW_HOURS = 22;
export const ORIGINAL_VERIFICATION_WINDOW_MS = ORIGINAL_VERIFICATION_WINDOW_HOURS * 60 * 60_000;
export const ORIGINAL_VERIFICATION_WINDOW_SECONDS = ORIGINAL_VERIFICATION_WINDOW_HOURS * 60 * 60;
export const ORIGINAL_VERIFICATION_EXPIRED = 'OUTSIDE_TWENTY_TWO_HOUR_ORIGINAL_VERIFICATION_WINDOW';
