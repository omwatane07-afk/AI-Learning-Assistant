const API_BASE_URL = "http://localhost:3000";

// -------- typedefs --------
/**
 * @typedef {Object} FlashcardItem
 * @property {string} question - The flashcard question.
 * @property {string} answer - The flashcard answer.
 */

/**
 * @typedef {Object} QuizItem
 * @property {string} question - The quiz question.
 * @property {string[]} options - The multiple choice options.
 * @property {string} answer - The correct answer.
 */

const summaryBtn = document.getElementById("summaryBtn");
const flashcardsBtn = document.getElementById("flashcardsBtn");
const quizBtn = document.getElementById("quizBtn");
const historyBtn = document.getElementById("historyBtn");

const selectedTextArea = document.getElementById("selectedText");
const topicTitleInput = document.getElementById("topicTitle");
const outputDiv = document.getElementById("output");
const historySection = document.getElementById("historySection");
const historyTableBody = document.querySelector("#historyTable tbody");

// -------- get selected text from active tab --------

/**
 * Loads the currently selected text from the active browser tab into the text area.
 */
function loadSelectedText() {
  try {
    if (typeof chrome === "undefined" || !chrome.tabs) return; // Fallback if outside extension context

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs.length) return;

      chrome.scripting.executeScript(
        {
          target: { tabId: tabs[0].id },
          func: () => window.getSelection().toString(),
        },
        (results) => {
          if (chrome.runtime.lastError) {
            console.warn("Could not execute script to get selected text:", chrome.runtime.lastError);
            return;
          }
          if (results && results[0] && results[0].result) {
            selectedTextArea.value = results[0].result;
          }
        }
      );
    });
  } catch (err) {
    console.warn("Failed to load selected text:", err);
  }
}

loadSelectedText();

// -------- helpers --------

/**
 * Calls the backend API endpoints.
 * 
 * @param {string} path - The API endpoint path.
 * @param {Object} body - The JSON payload to send.
 * @returns {Promise<Object>} The parsed JSON response.
 * @throws {Error} Throws an error if the fetch fails or response is not ok.
 */
async function callBackend(path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

/**
 * Safely renders plain text to simple HTML (escaping and replacing newlines).
 * 
 * @param {string} text - The markdown or raw text.
 * @returns {string} The HTML-escaped string with `<br>` tags.
 */
function renderMarkdown(text) {
  const safe = (text || "")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return safe.replace(/\n/g, "<br>");
}

/**
 * Retrieves the topic title from the input field or infers it from the selected text.
 * 
 * @returns {string} The topic title.
 */
function getTopicTitle() {
  const trimmedTitle = topicTitleInput.value.trim();
  if (trimmedTitle) return trimmedTitle;

  if (selectedTextArea.value) {
    return selectedTextArea.value.slice(0, 40) + "...";
  }
  return "Untitled topic";
}

// -------- buttons --------

summaryBtn.addEventListener("click", async () => {
  const text = selectedTextArea.value.trim();
  if (!text) {
    outputDiv.innerHTML = "Please select or paste some text.";
    return;
  }

  outputDiv.innerHTML = "Generating summary...";

  try {
    const backendResponse = await callBackend("/summary", { text });
    const resultText =
      backendResponse.summary || backendResponse.result || JSON.stringify(backendResponse, null, 2);
    outputDiv.innerHTML = renderMarkdown(resultText);
    await logSession({ hasSummary: true });
  } catch (err) {
    console.error("Failed to generate summary:", err);
    outputDiv.innerHTML = "Error generating summary.";
  }
});

flashcardsBtn.addEventListener("click", async () => {
  const text = selectedTextArea.value.trim();
  if (!text) {
    outputDiv.innerHTML = "Please select or paste some text.";
    return;
  }

  outputDiv.innerHTML = "Generating flashcards...";

  try {
    const backendResponse = await callBackend("/flashcards", { text });
    let flashcardsText = backendResponse.flashcards || backendResponse.result || "";

    let html = "";
    try {
      /** @type {FlashcardItem[]} */
      const parsedItems = JSON.parse(flashcardsText);
      if (Array.isArray(parsedItems)) {
        html =
          "<ol>" +
          parsedItems
            .map(
              (card) =>
                `<li><strong>Q:</strong> ${renderMarkdown(
                  card.question || ""
                )}<br><strong>A:</strong> ${renderMarkdown(card.answer || "")}</li>`
            )
            .join("") +
          "</ol>";
      } else {
        html = `<pre>${renderMarkdown(flashcardsText)}</pre>`;
      }
    } catch (parseError) {
      console.warn("Failed to parse flashcards JSON, falling back to raw text:", parseError);
      html = `<pre>${renderMarkdown(flashcardsText)}</pre>`;
    }

    outputDiv.innerHTML = html;
    await logSession({ hasFlashcards: true });
  } catch (err) {
    console.error("Error generating flashcards:", err);
    outputDiv.innerHTML = "Error generating flashcards.";
  }
});

quizBtn.addEventListener("click", async () => {
  const text = selectedTextArea.value.trim();
  if (!text) {
    outputDiv.innerHTML = "Please select or paste some text.";
    return;
  }

  outputDiv.innerHTML = "Generating quiz...";

  try {
    const backendResponse = await callBackend("/quiz", { text });
    let quizText = backendResponse.quiz || backendResponse.result || "";

    let html = "";
    try {
      /** @type {QuizItem[]} */
      const parsedItems = JSON.parse(quizText);
      if (Array.isArray(parsedItems)) {
        html =
          "<ol>" +
          parsedItems
            .map((quizItem, idx) => {
              const options = quizItem.options || [];
              const answer = quizItem.answer || "";
              const optHtml = options
                .map(
                  (optionText, i) =>
                    `<label style="display:block;">
                       <input type="radio" name="q${idx}" value="${optionText}">
                       ${String.fromCharCode(65 + i)}. ${renderMarkdown(optionText)}
                     </label>`
                )
                .join("");
              return `<li>
                        <div>${renderMarkdown(quizItem.question || "")}</div>
                        <div style="margin-top:4px;">${optHtml}</div>
                        <div data-answer="${answer}" class="quiz-answer" style="margin-top:4px; display:none;">
                          Correct answer: ${renderMarkdown(answer)}
                        </div>
                      </li>`;
            })
            .join("") +
          "</ol>" +
          `<button id="showAnswersBtn">Show answers</button>`;
      } else {
        html = `<pre>${renderMarkdown(quizText)}</pre>`;
      }
    } catch (parseError) {
      console.warn("Failed to parse quiz JSON, falling back to raw text:", parseError);
      html = `<pre>${renderMarkdown(quizText)}</pre>`;
    }

    outputDiv.innerHTML = html;

    const showBtn = document.getElementById("showAnswersBtn");
    if (showBtn) {
      showBtn.addEventListener("click", () => {
        document
          .querySelectorAll(".quiz-answer")
          .forEach((el) => (el.style.display = "block"));
      });
    }

    await logSession({ hasQuiz: true });
  } catch (err) {
    console.error("Error generating quiz:", err);
    outputDiv.innerHTML = "Error generating quiz.";
  }
});

// -------- logging + history --------

/**
 * Logs the session statistics to the backend.
 * 
 * @param {Object} flags - The tracking flags.
 * @param {boolean} [flags.hasSummary]
 * @param {boolean} [flags.hasFlashcards]
 * @param {boolean} [flags.hasQuiz]
 * @param {number|null} [flags.quizScore]
 * @returns {Promise<void>}
 */
async function logSession(flags) {
  try {
    await fetch(`${API_BASE_URL}/log-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topicTitle: getTopicTitle(),
        hasSummary: !!flags.hasSummary,
        hasFlashcards: !!flags.hasFlashcards,
        hasQuiz: !!flags.hasQuiz,
        quizScore: flags.quizScore ?? null,
      }),
    });
  } catch (err) {
    console.error("Error in logSession:", err);
  }
}

historyBtn.addEventListener("click", async () => {
  if (!historySection.classList.contains("hidden")) {
    historySection.classList.add("hidden");
    return;
  }

  await loadHistory();
  historySection.classList.remove("hidden");
});

/**
 * Loads the learning history from the backend and populates the history table.
 */
async function loadHistory() {
  historyTableBody.innerHTML = "";

  try {
    const response = await fetch(`${API_BASE_URL}/history`, { method: "GET" });
    if (!response.ok) throw new Error(await response.text());

    const backendResponse = await response.json();
    const history = backendResponse.history || [];

    history.forEach((row) => {
      const tr = document.createElement("tr");

      const titleTd = document.createElement("td");
      titleTd.textContent = row.TOPIC_TITLE || "Untitled";

      const sTd = document.createElement("td");
      sTd.textContent = row.HAS_SUMMARY ? "Yes" : "No";

      const fTd = document.createElement("td");
      fTd.textContent = row.HAS_FLASHCARDS ? "Yes" : "No";

      const qTd = document.createElement("td");
      qTd.textContent = row.HAS_QUIZ ? "Yes" : "No";

      const scoreTd = document.createElement("td");
      scoreTd.textContent = row.QUIZ_SCORE != null ? row.QUIZ_SCORE : "-";

      const whenTd = document.createElement("td");
      const created = row.CREATED_AT || row.created_at;
      whenTd.textContent = created || "";

      tr.appendChild(titleTd);
      tr.appendChild(sTd);
      tr.appendChild(fTd);
      tr.appendChild(qTd);
      tr.appendChild(scoreTd);
      tr.appendChild(whenTd);

      historyTableBody.appendChild(tr);
    });
  } catch (err) {
    console.error("Failed to load history:", err);
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = "Failed to load history.";
    tr.appendChild(td);
    historyTableBody.appendChild(tr);
  }
}
