import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import snowflake from "snowflake-sdk";
import fetch from "node-fetch";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// -------- Perplexity helper --------

async function callPerplexity(messages) {
  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.PPLX_API_KEY}`,
    },
    body: JSON.stringify({
      model: "sonar",
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Perplexity API error:", errorText);
    throw new Error("Perplexity API request failed");
  }

  const data = await response.json();
  console.log("PPLX RAW:", JSON.stringify(data));
  return data.choices?.[0]?.message?.content || "";
}

// -------- Snowflake connection --------

const sfConnection = snowflake.createConnection({
  account: process.env.SF_ACCOUNT,
  username: process.env.SF_USER,
  password: process.env.SF_PASSWORD,
  warehouse: process.env.SF_WAREHOUSE,
  database: process.env.SF_DATABASE,
  schema: process.env.SF_SCHEMA,
});

sfConnection.connect((err, conn) => {
  if (err) {
    console.error("Snowflake connection failed:", err);
  } else {
    console.log("Connected to Snowflake as id: " + conn.getId());

    // 1) USE WAREHOUSE
    sfConnection.execute({
      sqlText: `USE WAREHOUSE ${process.env.SF_WAREHOUSE};`,
      complete: (err1) => {
        if (err1) {
          console.error("Failed to set warehouse:", err1);
          return;
        }
        // 2) USE DATABASE
        sfConnection.execute({
          sqlText: `USE DATABASE ${process.env.SF_DATABASE};`,
          complete: (err2) => {
            if (err2) {
              console.error("Failed to set database:", err2);
              return;
            }
            // 3) USE SCHEMA
            sfConnection.execute({
              sqlText: `USE SCHEMA ${process.env.SF_SCHEMA};`,
              complete: (err3) => {
                if (err3) {
                  console.error("Failed to set schema:", err3);
                } else {
                  console.log(
                    "Snowflake context set (warehouse/database/schema)."
                  );
                }
              },
            });
          },
        });
      },
    });
  }
});

function logHistory({ topicTitle, hasSummary, hasFlashcards, hasQuiz, quizScore }) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO LEARNING_HISTORY
        (USER_ID, TOPIC_TITLE, SOURCE_URL, HAS_SUMMARY, HAS_FLASHCARDS, HAS_QUIZ, QUIZ_SCORE)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const binds = [
      "default_user",
      topicTitle || "Untitled topic",
      null,
      !!hasSummary,
      !!hasFlashcards,
      !!hasQuiz,
      quizScore != null ? quizScore : null,
    ];

    sfConnection.execute({
      sqlText: sql,
      binds,
      complete: (err) => {
        if (err) return reject(err);
        resolve();
      },
    });
  });
}

// -------- Routes --------

app.post("/summary", async (req, res) => {
  try {
    const { text } = req.body;

    const content = await callPerplexity([
      {
        role: "system",
        content: "You are a helpful assistant that summarizes content for students.",
      },
      {
        role: "user",
        content: `Summarize this content in simple bullet points:\n\n${text}`,
      },
    ]);

    res.json({ summary: content });
  } catch (error) {
    console.error("/summary error:", error);
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

app.post("/flashcards", async (req, res) => {
  try {
    const { text } = req.body;

    const content = await callPerplexity([
      {
        role: "system",
        content: "You are a helpful assistant that creates flashcards for revision.",
      },
      {
        role: "user",
        content: `Create 8-12 Q&A style flashcards from this content.
Respond ONLY with a valid JSON array (no explanation text) of objects:
[{ "question": "...", "answer": "..." }].

Content:
${text}`,
      },
    ]);

    res.json({ flashcards: content });
  } catch (error) {
    console.error("/flashcards error:", error);
    res.status(500).json({ error: "Failed to generate flashcards" });
  }
});

app.post("/quiz", async (req, res) => {
  try {
    const { text } = req.body;

    const content = await callPerplexity([
      {
        role: "system",
        content: "You are a helpful assistant that creates quizzes for students.",
      },
      {
        role: "user",
        content: `Create a 5-question multiple-choice quiz from this content.
Respond ONLY with a valid JSON array (no explanation text) of objects:
[{ "question": "...", "options": ["A","B","C","D"], "answer": "A" }].

Content:
${text}`,
      },
    ]);

    res.json({ quiz: content });
  } catch (error) {
    console.error("/quiz error:", error);
    res.status(500).json({ error: "Failed to generate quiz" });
  }
});

// ---- logging + history APIs ----

app.post("/log-session", async (req, res) => {
  try {
    const { topicTitle, hasSummary, hasFlashcards, hasQuiz, quizScore } = req.body;

    await logHistory({ topicTitle, hasSummary, hasFlashcards, hasQuiz, quizScore });

    res.json({ ok: true });
  } catch (e) {
    console.error("/log-session error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/history", (req, res) => {
  sfConnection.execute({
    sqlText: `
      SELECT TOPIC_TITLE,
             HAS_SUMMARY,
             HAS_FLASHCARDS,
             HAS_QUIZ,
             QUIZ_SCORE,
             CREATED_AT
      FROM LEARNING_HISTORY
      WHERE USER_ID = 'default_user'
      ORDER BY CREATED_AT DESC
      LIMIT 20
    `,
    complete: (err, stmt, rows) => {
      if (err) {
        console.error("/history error:", err);
        return res.status(500).json({ error: err.message });
      }

      res.json({ history: rows });
    },
  });
});

// -------- Server start --------

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
