BEGIN;
CREATE TABLE geomacro.api_key_rate_windows (
 api_key_id uuid NOT NULL REFERENCES geomacro.api_keys(id),
 window_started_at timestamptz NOT NULL,
 request_count integer NOT NULL CHECK(request_count>0),
 PRIMARY KEY(api_key_id,window_started_at)
);
CREATE INDEX api_rate_expiry_idx ON geomacro.api_key_rate_windows(window_started_at);
ALTER TABLE geomacro.api_key_rate_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON geomacro.api_key_rate_windows FROM PUBLIC,anon,authenticated,service_role,geomacro_billing;
CREATE FUNCTION geomacro.authorize_credit_key(p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE k geomacro.api_keys; n integer; bucket timestamptz;
BEGIN
 SELECT * INTO k FROM geomacro.api_keys WHERE key_hash=p_hash FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'KEY_UNAVAILABLE'; END IF;
 IF k.revoked_at IS NOT NULL OR k.expires_at<=clock_timestamp() OR
 NOT ('risk-gate:read'=ANY(k.scopes)) OR
 NOT EXISTS(SELECT FROM geomacro.users WHERE id=k.user_id AND status='active')
 THEN RAISE EXCEPTION 'KEY_UNAVAILABLE'; END IF;
 bucket:=date_trunc('minute',clock_timestamp());
 INSERT INTO geomacro.api_key_rate_windows(api_key_id,window_started_at,request_count)
 VALUES(k.id,bucket,1) ON CONFLICT(api_key_id,window_started_at)
 DO UPDATE SET request_count=geomacro.api_key_rate_windows.request_count+1
 WHERE geomacro.api_key_rate_windows.request_count<k.rate_limit_per_minute
 RETURNING request_count INTO n;
 IF n IS NULL THEN RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED'; END IF;
 RETURN jsonb_build_object('user_id',k.user_id,'api_key_id',k.id,'rate_limit',k.rate_limit_per_minute,
  'remaining',k.rate_limit_per_minute-n,'reset_at',bucket+interval '1 minute');
END $$;
CREATE FUNCTION geomacro.prune_rate_windows()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n integer;
BEGIN
 DELETE FROM geomacro.api_key_rate_windows WHERE (api_key_id,window_started_at) IN (
 SELECT api_key_id,window_started_at FROM geomacro.api_key_rate_windows
 WHERE window_started_at<clock_timestamp()-interval '2 days' LIMIT 1000);
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION geomacro.authorize_credit_key(text),geomacro.prune_rate_windows() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION geomacro.authorize_credit_key(text),geomacro.prune_rate_windows() TO geomacro_billing;
CREATE FUNCTION geomacro.credit_replay(p_hash text,p_request uuid,p_fingerprint text,p_subject text,p_tier geomacro.tier)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT FROM geomacro.usage_logs WHERE request_id=p_request) THEN RETURN NULL; END IF;
 RETURN geomacro.prepare(p_hash,p_request,p_fingerprint,p_subject,p_tier,ARRAY[]::geomacro.tier[]);
END $$;
CREATE FUNCTION geomacro.list_api_keys(p_user uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'prefix',prefix,'label',label,
 'rate_limit_per_minute',rate_limit_per_minute,'created_at',created_at,'revoked_at',revoked_at,'expires_at',expires_at)
 ORDER BY created_at DESC),'[]'::jsonb) FROM geomacro.api_keys WHERE user_id=p_user
$$;
REVOKE ALL ON FUNCTION geomacro.credit_replay(text,uuid,text,text,geomacro.tier),geomacro.list_api_keys(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION geomacro.credit_replay(text,uuid,text,text,geomacro.tier),geomacro.list_api_keys(uuid) TO geomacro_billing;
COMMIT;
