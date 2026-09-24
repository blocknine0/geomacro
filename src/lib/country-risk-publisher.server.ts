    )
  ) {
    throw new Error(
      "Invalid as_of timestamp",
    );
  }

  const deliveryProfile =
    input.delivery_profile ??
    "CANONICAL";

  const loaded =
    deliveryProfile === "FEDERICO_STRICT"
      ? await loadFedericoStrictEvents(
          asOf,
          iso3,
        )
      : await loadRecentStructuredEvents(
          asOf,
        );

  const eligibleEventIds =
    deliveryProfile === "PUBLIC_DEMO" ||
    deliveryProfile === "CANONICAL"
      ? new Set(
          loaded
            .commercial_eligibility
            .filter(
              item =>
                item.status ===
                  "VERIFIED" ||
                item.status ===
                  "DERIVED_ONLY",
            )
            .map(
              item =>
                item.event_id,
            ),
        )
      : null;

  const events =
    eligibleEventIds
      ? loaded.events.filter(
          event =>
            eligibleEventIds.has(
              event.id,
            ),
        )
      : loaded.events;

  const commercialEligibility =
    eligibleEventIds
      ? loaded
          .commercial_eligibility
          .filter(
            item =>
              eligibleEventIds.has(
                item.event_id,
              ),
          )
      : loaded
          .commercial_eligibility;

  const countryEvents =
    events.filter(