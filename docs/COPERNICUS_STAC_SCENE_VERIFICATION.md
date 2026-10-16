# Copernicus original scene verification

Source: official Copernicus Data Space Ecosystem STAC catalogue, collection `sentinel-2-l2a`. The upstream documentation supports collection Item retrieval, bounding boxes and acquisition timestamps. Research-only and no new commercial grant.

One read-only 512 KiB request per protected workflow run with a 10-second deadline checks a small fixed area in northern Chile and the last 60-day window. The worker validates the requested exact collection, each STAC Feature geometry, satellite acquisition timestamp, area intersection and the presence of asset descriptors, then stores only sanitized status, count, acquisition time and zero-cost boundaries. Individual scene identifiers, asset hrefs and content do not enter D1/B2/GitHub artifacts or customer output. Failure, empty result or out-of-window responses remain degraded. No Supabase or funds.

**Not complete:** a STAC asset descriptor does not prove original imagery bytes are retrievable; CDSE assets can require separate authenticated S3/Process API rights or quotas. This lane cannot infer mineral supply disruption, exact affected country or regulatory event from a satellite scene. Actual asset download, imagery hash/readback and customer source-license approvals require separate official authentication and governance.

No changes to existing three-category canonical engine, GRI, signed publisher or x402. To run locally: `node --test scripts/tests/copernicus-stac-scenes.test.mjs`. Protected production workflow: `Copernicus STAC scene verification (research-only)`.
