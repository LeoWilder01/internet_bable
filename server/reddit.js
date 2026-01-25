// reddit.js - fetch comments from reddit public api
const fetch = require("node-fetch");

const REDDIT_SEARCH = "https://www.reddit.com/search.json";
const PER_PERIOD = 30;

const headers = {
  "User-Agent": "SlangTracker/1.0",
};

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// fetch comments with pagination
async function fetchComments(slang, total) {
  let all = [];
  let after = null;

  while (all.length < total) {
    const params = new URLSearchParams({
      q: slang,
      sort: "relevance",
      limit: 100,
    });
    if (after) params.set("after", after);

    try {
      await sleep(1000); // be nice to reddit
      const res = await fetch(`${REDDIT_SEARCH}?${params}`, { headers });

      if (!res.ok) {
        console.log(`Reddit error: ${res.status}`);
        break;
      }

      const data = await res.json();
      const comments = data?.data?.children || [];
      after = data?.data?.after;

      console.log(`Reddit page: got ${comments.length} raw results, after=${after}`);

      for (const c of comments) {
        // comments use body, posts use selftext or title
        const text = c.data.body || c.data.selftext || c.data.title || "";
        if (text && text.toLowerCase().includes(slang.toLowerCase())) {
          all.push({
            user: c.data.author,
            text: text.slice(0, 500),
            time: c.data.created_utc
              ? new Date(c.data.created_utc * 1000).toISOString().split("T")[0]
              : null,
          });
        }
      }

      // no more pages
      if (!after || comments.length === 0) break;

    } catch (err) {
      console.log("Reddit fetch error:", err.message);
      break;
    }
  }

  return all;
}

// get comments and split evenly across periods
async function fetchAllPeriods(slang, periods) {
  if (!periods || periods.length === 0) return [];

  const needed = periods.length * PER_PERIOD;
  const comments = await fetchComments(slang, needed);

  console.log(`Got ${comments.length} comments for "${slang}"`);

  // distribute evenly
  const results = [];
  let idx = 0;

  for (const period of periods) {
    const chunk = comments.slice(idx, idx + PER_PERIOD);
    idx += PER_PERIOD;

    results.push({
      ...period,
      comments: chunk,
    });
  }

  return results;
}

module.exports = { fetchComments, fetchAllPeriods };
