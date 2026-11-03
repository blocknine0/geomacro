/** P0-A D1 source configuration contract. Runtime validation lives in the Worker. */
export interface SourceConfig {
  source_id: string;
  canonical_endpoint: string;
  parser_type: 'RSS_2' | 'ATOM' | 'RDF' | 'JSON_REST' | 'CSV_STREAM' | 'HTML_BOUNDED';
  intended_category: 'GEOPOLITICS' | 'MACRO_FX' | 'CRITICAL_MINERALS';
  country_iso3: string | 'GLOBAL';
  rights_tier: 'COMMERCIAL_APPROVED' | 'RESEARCH_ONLY' | 'PENDING_AUDIT';
  polling_interval_sec: number;
  rate_limit_backoff: {
    max_retries: number;
    base_delay_ms: number;
    respect_retry_after: boolean;
  };
  fallback_endpoint?: string;
  last_cursor?: string;
}
