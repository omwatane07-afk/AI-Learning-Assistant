import "dotenv/config";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PPLX_API_KEY = process.env.PPLX_API_KEY;

async function callPerplexity(systemPrompt, userText) {
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PPLX_API_KEY}`,
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error("Perplexity error: " + res.status + " " + errText);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "No response from model.";
}

// SUMMARY (2–3 short bullets)
app.post("/summary", async (req, res) => {
  try {
    const { text } = req.body;
    const systemPrompt = `
You are an AI study assistant.

Summarize the given content in MAXIMUM 3 bullet points.

Rules:
- 2 to 3 bullets only.
- Each bullet should be short (under 15 words).
- No extra explanation, no intro, no outro.

Output format:
- Bullet list starting with "- ".
`;
    const result = await callPerplexity(systemPrompt, text);
    res.json({ result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// FLASHCARDS
app.post("/flashcards", async (req, res) => {
  try {
    const { text } = req.body;
    const systemPrompt = `
You are an AI flashcard generator.

From the content, create 8–12 concise flashcards.
Format strictly as:
Q: ...
A: ...
`;
    const result = await callPerplexity(systemPrompt, text);
    res.json({ result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// QUIZ → structured JSON for interactive flow
app.post("/quiz", async (req, res) => {
  try {
    const { text, count } = req.body;
    const numQ = Math.max(1, Math.min(20, Number(count) || 5));

    const systemPrompt = `
You are an AI quiz generator.

From the content, create ${numQ} multiple-choice questions.

Output JSON ONLY, no explanation, no markdown. The JSON must be:

[
  {
    "question": "Question text here",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_index": 0
  },
  ...
]

Rules:
- Exactly 4 options per question.
- "correct_index" is 0, 1, 2, or 3 for A, B, C, D respectively.
- Do NOT include any text outside the JSON.
`;

    const raw = await callPerplexity(systemPrompt, text);

    let jsonText = raw.trim();
    const firstBracket = jsonText.indexOf("[");
    const lastBracket = jsonText.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket !== -1) {
      jsonText = jsonText.slice(firstBracket, lastBracket + 1);
    }

    let quizArray;
    try {
      quizArray = JSON.parse(jsonText);
    } catch (e) {
      return res
        .status(500)
        .json({ error: "Failed to parse quiz JSON from model output." });
    }

    if (!Array.isArray(quizArray) || quizArray.length === 0) {
      return res.status(500).json({ error: "Quiz JSON is empty or invalid." });
    }

    res.json({ quiz: quizArray });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server listening on " + PORT));
