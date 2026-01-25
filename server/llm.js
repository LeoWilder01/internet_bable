// llm.js - talk to openrouter
const fetch = require("node-fetch");

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "nvidia/nemotron-3-nano-30b-a3b:free";

function buildPrompt(slang) {
  return `You are a slang historian. Analyze the English slang/phrase: "${slang}"

Return a JSON object with this exact structure:
{
  "currentMeaning": "what it means today in 1-2 sentences",
  "periods": [
    {
      "timeRange": "e.g. 2014-2016",
      "meaning": "what it meant during this period",
      "origin": "cultural event or context that shaped this meaning, be specific about who/what/when"
    }
  ]
}

Include 3-6 time periods showing how the meaning evolved. Start from earliest known usage to present.
Be specific about cultural moments: songs, artists, memes, events that shifted the meaning.
Return ONLY valid JSON, no markdown, no explanation.`;
}

// streaming version - yields chunks
async function* streamAnalysis(slang, apiKey) {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: buildPrompt(slang) }],
      stream: true,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter error: ${res.status}`);
  }

  const reader = res.body;
  let buffer = "";

  for await (const chunk of reader) {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep incomplete line

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch (e) {
          // ignore parse errors on partial chunks
        }
      }
    }
  }
}

// non-streaming version for simplicity
async function analyzeSlang(slang, apiKey) {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: buildPrompt(slang) }],
      stream: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error: ${res.status} - ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;

  // try to parse JSON from response
  try {
    // sometimes LLM wraps in ```json blocks
    let cleaned = content.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/```json?\n?/g, "").replace(/```/g, "");
    }
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error("LLM returned invalid JSON: " + content.slice(0, 200));
  }
}

module.exports = { streamAnalysis, analyzeSlang };
