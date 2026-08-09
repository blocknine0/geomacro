import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

async function backfillSourceDomain() {
  console.log("Run node scripts/backfill-source-domain.js");

  let toUpdate = [];
  {
    const PAGE_SIZE = 1000;
    let from = 0;
    while (true) {
      const { data: page, error: pageError } = await supabase
        .from('events')
        .select('id, source_url')
        .is('source_domain', null)
        .not('source_url', 'is', null)
        .range(from, from + PAGE_SIZE - 1);

      if (pageError) {
        console.error("❌ Failed to fetch rows needing backfill:", pageError.message);
        return;
      }
      if (!page || page.length === 0) break;
      toUpdate = toUpdate.concat(page);
      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  console.log(`${toUpdate.length} row(s) found with a missing source_domain.`);

  if (toUpdate.length === 0) {
    console.log("Nothing to backfill. Done.");
    return;
  }

  let updated = 0;
  let failed = 0;

  for (const row of toUpdate) {
    const domain = extractDomain(row.source_url);

    const { error: updateError } = await supabase
      .from('events')
      .update({ source_domain: domain })
      .eq('id', row.id);

    if (updateError) {
      console.error(`  ❌ Failed to update row ${row.id}:`, updateError.message);
      failed++;
    } else {
      updated++;
    }
  }

  console.log(`\nDone. Backfilled ${updated} row(s), ${failed} failed.`);
}

backfillSourceDomain().catch(console.error);
