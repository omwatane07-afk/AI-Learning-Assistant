const API_BASE_URL = "http://localhost:3000";

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

function loadSelectedText() {
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs.length) return;

      chrome.scripting.executeScript(
        {
          target: { tabId: tabs[0].id },
          func: () => window.getSelection().toString(),
        },
        (results) => {
          if (chrome.runtime.lastError) return;
          if (results && results[0] && results[0].result) {
            selectedTextArea.value = results[0].result;
          }
        }
      );
    });
  } catch (_) {
    // ignore if not in extension context
  }
}

loadSelectedText();

// -------- helpers --------

async function callBackend(path, body) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function renderMarkdown(text) {
  const safe = (text || "")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return safe.replace(/\n/g, "<br>");
}

function getTopicTitle() {
  const t = topicTitleInput.value.trim();
  if (t) return t;

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
    const data = await callBackend("/summary", { text });
    console.log("SUMMARY RESPONSE:", data);
    const resultText =
      data.summary || data.result || JSON.stringify(data, null, 2);
    outputDiv.innerHTML = renderMarkdown(resultText);
    await logSession({ hasSummary: true });
  } catch (e) {
    console.error(e);
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
    const data = await callBackend("/flashcards", { text });
    let fcText = data.flashcards || data.result || "";

    let html = "";
    try {
      const arr = JSON.parse(fcText);
      if (Array.isArray(arr)) {
        html =
          "<ol>" +
          arr
            .map(
              (card) =>
                `<li><strong>Q:</strong> ${renderMarkdown(
                  card.question || ""
                )}<br><strong>A:</strong> ${renderMarkdown(card.answer || "")}</li>`
            )
            .join("") +
          "</ol>";
      } else {
        html = `<pre>${renderMarkdown(fcText)}</pre>`;
      }
    } catch (_) {
      html = `<pre>${renderMarkdown(fcText)}</pre>`;
    }

    outputDiv.innerHTML = html;
    await logSession({ hasFlashcards: true });
  } catch (e) {
    console.error(e);
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
    const data = await callBackend("/quiz", { text });
    let quizText = data.quiz || data.result || "";

    let html = "";
    try {
      const arr = JSON.parse(quizText);
      if (Array.isArray(arr)) {
        html =
          "<ol>" +
          arr
            .map((q, idx) => {
              const options = q.options || [];
              const answer = q.answer || "";
              const optHtml = options
                .map(
                  (opt, i) =>
                    `<label style="display:block;">
                       <input type="radio" name="q${idx}" value="${opt}">
                       ${String.fromCharCode(65 + i)}. ${renderMarkdown(opt)}
                     </label>`
                )
                .join("");
              return `<li>
                        <div>${renderMarkdown(q.question || "")}</div>
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
    } catch (_) {
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
  } catch (e) {
    console.error(e);
    outputDiv.innerHTML = "Error generating quiz.";
  }
});

// -------- logging + history --------

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
  } catch (e) {
    console.error("logSession error", e);
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

async function loadHistory() {
  historyTableBody.innerHTML = "";

  try {
    const res = await fetch(`${API_BASE_URL}/history`, { method: "GET" });
    if (!res.ok) throw new Error(await res.text());

    const data = await res.json();
    const history = data.history || [];

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
  } catch (e) {
    console.error(e);
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = "Failed to load history.";
    tr.appendChild(td);
    historyTableBody.appendChild(tr);
  }
}
