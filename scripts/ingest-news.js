import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

// ১. সুপাবেস ও গ্রোক ইনিশিয়ালাইজেশন
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// ২. সম্পূর্ণ আন্তর্জাতিক লেভেলের গ্লোবাল ক্যাটাগরি এবং কুয়েরি সেট
const CATEGORIES = [
  {
    name: "geopolitics",
    queries: [
      "global war military conflict ceasefire",
      "NATO Russia China Taiwan Middle East sanctions",
      "nuclear weapons diplomacy multilateral treaty UN",
      "BRICS global south bilateral security pact",
    ],
  },
  {
    name: "macro",
    queries: [
      "Federal Reserve ECB BOJ interest rates inflation central bank",
      "global recession GDP stagflation IMF World Bank forecast",
      "sovereign debt default restructuring IMF bailout emerging markets",
      "currency war dollar dominance yuan yen currency devaluation",
      "supply chain shock shipping disruption energy crisis oil prices",
      "global banking crisis contagion systemic risk credit crunch",
    ],
  },
  {
    name: "rare_earth",
    queries: [
      "semiconductor ASML TSMC chips export controls",
      "lithium cobalt nickel critical minerals mining policy",
      "rare earth refining monopoly processing export ban China",
      "global tech war technology decoupling supply chain localization",
      "US EU Africa South America critical raw materials trade agreement",
    ],
  },
  {
    name: "crypto",
    queries: [
      "global crypto regulation SEC MiCA cross border payment",
      "Bitcoin Ethereum institutional adoption spot ETF volume",
      "stablecoin CBDC DeFi blockchain policy global financial system",
      "crypto exchange liquidity crisis hack exploit enforcement action",
    ],
  },
];

// ৩. টাইটেল নরমালাইজেশন ফাংশন (ডুপ্লিকেট রো ফিল্টারিংয়ের জন্য)
function normalizeTitle(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/[^\w\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ৪. Groq LLM এর মাধ্যমে রিলেভেন্স ও সিভিয়ারিটি স্কোরিং মেথড
async function checkArticleRelevance(title, description, category) {
  try {
    // 💡 Groq ফ্রি টায়ারের রেট লিমিট (RPM) প্রটেকশনের জন্য ১ সেকেন্ডের ডিলে
    await new Promise(resolve => setTimeout(resolve, 1000));

    const prompt = `You are an expert financial and geopolitical risk analyst. Analyze the following article for the category "${category}".
    
    Title: "${title}"
    Description: "${description}"

    Determine if this article represents a significant macro/geopolitical trend or shock. Discard sports, celebrity gossip, local crimes, or casual entertainment reviews.
    
    Respond STRICTLY in JSON format with two keys:
    - "relevant": boolean
    - "severity": number (from 0 to 100, where 100 is catastrophic global impact, e.g., world war or global systemic market crash).
    
    JSON format example:
    { "relevant": true, "severity": 65 }`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.1-8b-instant', // ✅ সচল ও দ্রুতগতির ফ্রি-টায়ের ফ্রেন্ডলি মডেল
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(chatCompletion.choices[0].message.content);
    return result;
  } catch (error) {
    console.error(`❌ LLM check failed for "${title}":`, error.message);
    return { relevant: false, severity: 0 };
  }
}

// ৫. এপিআই ফেচিং হ্যান্ডলার (NewsAPI ফলব্যাক টু দ্য গার্ডিয়ান)
async function fetchArticlesFromApis(query) {
  let articles = [];
  
  // ক) প্রথমে NewsAPI দিয়ে ট্রাই করা হবে
  try {
    const newsApiUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=10&apiKey=${process.env.NEWSAPI_KEY}`;
    const response = await fetch(newsApiUrl);
    
    if (response.status === 429) {
      throw new Error("NewsAPI rate limit hit");
    }
    
    const data = await response.json();
    if (data.articles) {
      return data.articles.map(a => ({
        title: a.title,
        description: a.description || "",
        url: a.url,
        source: 'newsapi'
      }));
    }
  } catch (e) {
    console.log(`   NewsAPI rate limit hit for query "${query}". Trying Guardian...`);
    
    // খ) ফলব্যাক: দ্য গার্ডিয়ান এপিআই (The Guardian API)
    try {
      const guardianUrl = `https://content.guardianapis.com/search?q=${encodeURIComponent(query)}&show-fields=trailText&page-size=10&api-key=${process.env.GUARDIAN_API_KEY}`;
      const response = await fetch(guardianUrl);
      const data = await response.json();
      
      if (data.response && data.response.results) {
        return data.response.results.map(a => ({
          title: a.webTitle,
          description: a.fields?.trailText || "",
          url: a.webUrl,
          source: 'guardian'
        }));
      }
    } catch (ge) {
      console.error(`   Failed fetching from Guardian for query "${query}":`, ge.message);
    }
  }
  
  return articles;
}

// ৬. মেইন ইনজেকশন রানার ফাংশন
async function ingestNews() {
  console.log("Run node scripts/ingest-news.js");

  // সুপাবেস থেকে অলরেডি এক্সিস্টিং ডাটা তুলে আনা
  const { data: existingEvents, error: fetchError } = await supabase
    .from('events')
    .select('url, title');

  if (fetchError) {
    console.error("❌ Failed to fetch existing entries from Supabase:", fetchError.message);
    return;
  }

  const existingUrls = new Set(existingEvents.map(e => e.url));
  const existingTitles = new Set(existingEvents.map(e => normalizeTitle(e.title)));

  console.log(`${existingUrls.size} existing unique URLs and ${existingTitles.size} existing titles fetched from Supabase.`);

  let totalInserted = 0;

  for (const category of CATEGORIES) {
    console.log(`\nProcessing category: ${category.name}`);
    let categoryInserted = 0;
    let seenInCurrentRun = new Set();

    for (const query of category.queries) {
      const fetched = await fetchArticlesFromApis(query);
      
      for (const article of fetched) {
        const normTitle = normalizeTitle(article.title);
        
        // ডুপ্লিকেট চেকিং লজিক (URL, এক্সিস্টিং টাইটেল এবং কারেন্ট রান ডুপ্লিকেট প্রটেকশন)
        if (existingUrls.has(article.url) || existingTitles.has(normTitle) || seenInCurrentRun.has(normTitle)) {
          continue;
        }

        seenInCurrentRun.add(normTitle);

        // LLM এর মাধ্যমে ফিল্টারিং এবং সিভিয়ারিটি ক্যালকুলেশন
        const assessment = await checkArticleRelevance(article.title, article.description, category.name);

        if (assessment.relevant) {
          // সুপাবেসে ডাটা ইনসার্ট করা হচ্ছে
          const { error: insertError } = await supabase
            .from('events')
            .insert([{
              title: article.title,
              description: article.description,
              url: article.url,
              category: category.name,
              severity: assessment.severity,
              market_created: false, // create-markets.js স্ক্রিপ্ট পরবর্তী ধাপে এটি প্রসেস করবে
              created_at: new Date().toISOString()
            }]);

          if (!insertError) {
            console.log(`  ✅ Successfully Inserted: "${article.title}" (severity ${assessment.severity})`);
            categoryInserted++;
            totalInserted++;
            existingTitles.add(normTitle); // মেমরি আপডেট যাতে পরবর্তী ক্যাটাগরি সেম টাইটেল ড্রপ করতে পারে
          } else {
            console.error(`  ❌ Database insertion failed:`, insertError.message);
          }
        } else {
          console.log(`  Rejected by LLM relevance check: "${article.title}"`);
        }
      }
    }
    console.log(`Inserted ${categoryInserted} events for ${category.name}.`);
  }

  console.log(`\nDone. Total unique inserted: ${totalInserted} events.`);
}

ingestNews().catch(console.error);
