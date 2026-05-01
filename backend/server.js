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

/**
 * Calls the Perplexity API to generate text based on the provided messages.
 * 
 * @param {Array<{role: string, content: string}>} messages - The conversation history.
 * @returns {Promise<string>} The generated content from the Perplexity API.
 * @throws {Error} Throws an error if the API request fails.
 */
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
    console.error("Error calling Perplexity API:", errorText);
    throw new Error(`Perplexity API request failed: ${errorText}`);
  }

  const perplexityResponse = await response.json();
  return perplexityResponse.choices?.[0]?.message?.content || "";
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

/**
 * Logs a user's learning session into Snowflake.
 * 
 * @param {Object} sessionDetails - Details of the learning session.
 * @param {string} [sessionDetails.topicTitle] - The title of the topic studied.
 * @param {boolean} [sessionDetails.hasSummary] - Whether a summary was generated.
 * @param {boolean} [sessionDetails.hasFlashcards] - Whether flashcards were generated.
 * @param {boolean} [sessionDetails.hasQuiz] - Whether a quiz was generated.
 * @param {number|null} [sessionDetails.quizScore] - The score obtained in the quiz.
 * @returns {Promise<void>} Resolves when the logging is complete.
 */
function logHistory({ topicTitle, hasSummary, hasFlashcards, hasQuiz, quizScore }) {
  return new Promise((resolve, reject) => {
    const sqlText = `
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
      sqlText,
      binds,
      complete: (err) => {
        if (err) {
          console.error("Error executing Snowflake INSERT:", err);
          return reject(err);
        }
        resolve();
      },
    });
  });
}

// -------- Routes --------

/**
 * POST /summary
 * Generates a bulleted summary of the provided text.
 */
app.post("/summary", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Missing required text field" });

    const generatedMessage = await callPerplexity([
      {
        role: "system",
        content: "You are a helpful assistant that summarizes content for students.",
      },
      {
        role: "user",
        content: `Summarize this content in simple bullet points:\n\n${text}`,
      },
    ]);

    res.json({ summary: generatedMessage });
  } catch (error) {
    console.error("Error in /summary route:", error.message || error);
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

/**
 * POST /flashcards
 * Generates flashcards based on the provided text.
 */
app.post("/flashcards", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Missing required text field" });

    const generatedMessage = await callPerplexity([
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

    res.json({ flashcards: generatedMessage });
  } catch (error) {
    console.error("Error in /flashcards route:", error.message || error);
    res.status(500).json({ error: "Failed to generate flashcards" });
  }
});

/**
 * POST /quiz
 * Generates a multiple-choice quiz based on the provided text.
 */
app.post("/quiz", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Missing required text field" });

    const generatedMessage = await callPerplexity([
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

    res.json({ quiz: generatedMessage });
  } catch (error) {
    console.error("Error in /quiz route:", error.message || error);
    res.status(500).json({ error: "Failed to generate quiz" });
  }
});

// ---- logging + history APIs ----

/**
 * POST /log-session
 * Logs the learning activity of the current session.
 */
app.post("/log-session", async (req, res) => {
  try {
    const { topicTitle, hasSummary, hasFlashcards, hasQuiz, quizScore } = req.body;

    await logHistory({ topicTitle, hasSummary, hasFlashcards, hasQuiz, quizScore });

    res.json({ ok: true });
  } catch (e) {
    console.error("Error in /log-session route:", e.message || e);
    res.status(500).json({ error: "Failed to log session" });
  }
});

/**
 * GET /history
 * Retrieves the recent learning history for the default user.
 */
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
        console.error("Error fetching history from Snowflake:", err.message || err);
        return res.status(500).json({ error: "Failed to fetch history" });
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
