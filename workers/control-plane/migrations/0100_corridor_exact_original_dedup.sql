-- Keep only the first observed native article row for each exact original
-- HTTPS permalink. Source-id + publication-time revisions are NOT new stories.
-- No raw headlines or event claims are written. Preserve the original clock.
DELETE FROM corridor_native_news_candidates
WHERE rowid NOT IN (
  SELECT MIN(rowid) FROM corridor_native_news_candidates GROUP BY article_url
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_corridor_native_news_exact_original
 ON corridor_native_news_candidates(article_url);
