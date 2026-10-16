-- Counter-only abuse control. No IPs, credentials, request bodies or evidence.
CREATE TABLE IF NOT EXISTS central_security_budget (
 route_class TEXT NOT NULL,
 bucket_kind TEXT NOT NULL CHECK (bucket_kind IN ('global','client')),
 bucket_key TEXT NOT NULL CHECK (length(bucket_key) BETWEEN 1 AND 6),
 window_start INTEGER NOT NULL,
 request_count INTEGER NOT NULL CHECK (request_count > 0),
 PRIMARY KEY (route_class,bucket_kind,bucket_key)
);
