import type { IntelEvent } from "./use-intelligence";

type PublicEventLabel = Pick<IntelEvent, "title" | "category" | "publicStatus">;

export type PublicEventExplanation = {
  label: string;
  text: string;
};

/**
 * The canonical GDELT v2 conflict-event export uses root event class 13
 * ("threaten") to create the already verified derived label:
 * "Geomacro observes threat activity in ...".
 *
 * The browser projection contains NO approved actor, target, method or
 * original report. It would be false to label these as terrorist, cyber,
 * military, or violent attacks. This is an explanation of the event TYPE,
 * not a newly invented event-specific finding.
 *
 * Keep this exact customer-facing explanation shared between the homepage
 * and /intelligence instead of guessing details from a generic category.
 */
export function publicEventExplanation(
  event: PublicEventLabel | null | undefined,
): PublicEventExplanation | null {
  if (
    !event ||
    event.publicStatus !== "live_observed" ||
    event.category !== "geopolitics" ||
    !/^Geomacro observes threat activity in \S/iu.test(event.title)
  ) {
    return null;
  }
  return {
    label: "Threat type",
    text: "Reported threats or warnings of possible action. The available update does not identify a specific actor or target.",
  };
}
