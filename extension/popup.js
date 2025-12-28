const API_BASE = "http://localhost:3000";

function getSelectedText(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    chrome.scripting.executeScript(
      {
        target: { tabId: tabs[0].id },
        func: () => window.getSelection().toString()
      },
      (results) => {
        const text = results && results[0] ? results[0].result : "";
        callback(text);
      }
    );
  });
}

function setOutput(text) {
  const el = document.getElementById("output");
  if (el) el.innerText = text;
}

function ensureTextSelected(text) {
  if (!text || !text.trim()) {
    setOutput("Please select some text on the page first.");
    return false;
  }
  return true;
}

async function callBackend(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error("Backend error: " + res.status + " " + err);
  }
  return res.json();
}

// ---------- SUMMARY ----------

document.getElementById("summaryBtn").onclick = () => {
  getSelectedText(async (text) => {
    if (!ensureTextSelected(text)) return;
    setOutput("Generating summary...");
    hideQuizArea();
    try {
      const data = await callBackend("/summary", { text });
      setOutput("Summary:\n\n" + data.result);
    } catch (e) {
      setOutput("Error: " + e.message);
    }
  });
};

// ---------- FLASHCARDS ----------

document.getElementById("flashcardBtn").onclick = () => {
  getSelectedText(async (text) => {
    if (!ensureTextSelected(text)) return;
    setOutput("Generating flashcards...");
    hideQuizArea();
    try {
      const data = await callBackend("/flashcards", { text });
      setOutput("Flashcards:\n\n" + data.result);
    } catch (e) {
      setOutput("Error: " + e.message);
    }
  });
};

// ---------- QUIZ INTERACTIVE ----------

let quizData = [];
let currentQuestionIndex = 0;
let score = 0;
let hasAnsweredCurrent = false;

const quizArea = document.getElementById("quizArea");
const quizQuestionEl = document.getElementById("quizQuestion");
const quizOptionsEl = document.getElementById("quizOptions");
const quizFeedbackEl = document.getElementById("quizFeedback");
const quizProgressEl = document.getElementById("quizProgress");
const submitAnswerBtn = document.getElementById("submitAnswerBtn");
const nextQuestionBtn = document.getElementById("nextQuestionBtn");

function hideQuizArea() {
  if (quizArea) quizArea.style.display = "none";
}

function showQuizArea() {
  if (quizArea) quizArea.style.display = "block";
}

function renderQuestion() {
  const q = quizData[currentQuestionIndex];
  if (!q) return;

  hasAnsweredCurrent = false;
  quizFeedbackEl.innerText = "";
  nextQuestionBtn.style.display = "none";

  quizQuestionEl.innerText = q.question;

  quizOptionsEl.innerHTML = "";
  q.options.forEach((opt, idx) => {
    const btn = document.createElement("button");
    btn.innerText = `(${String.fromCharCode(65 + idx)}) ${opt}`;
    btn.style.display = "block";
    btn.style.width = "100%";
    btn.style.margin = "3px 0";
    btn.onclick = () => {
      // select this option
      const all = quizOptionsEl.querySelectorAll("button");
      all.forEach((b) => (b.style.backgroundColor = ""));
      btn.style.backgroundColor = "#d0eaff";
      btn.dataset.selected = "true";
      all.forEach((b) => {
        if (b !== btn) delete b.dataset.selected;
      });
    };
    quizOptionsEl.appendChild(btn);
  });

  quizProgressEl.innerText = `Question ${currentQuestionIndex + 1} of ${
    quizData.length
  } | Score: ${score}`;
}

submitAnswerBtn.onclick = () => {
  if (!quizData.length) return;

  const q = quizData[currentQuestionIndex];
  const buttons = quizOptionsEl.querySelectorAll("button");
  let selectedIndex = -1;
  buttons.forEach((b, idx) => {
    if (b.dataset.selected === "true") selectedIndex = idx;
  });

  if (selectedIndex === -1) {
    quizFeedbackEl.innerText = "Please select an option first.";
    return;
  }

  if (hasAnsweredCurrent) {
    quizFeedbackEl.innerText = "You already answered. Click Next Question.";
    return;
  }

  hasAnsweredCurrent = true;

  const correctIndex = Number(q.correct_index);
  const isCorrect = selectedIndex === correctIndex;

  if (isCorrect) score++;

  buttons.forEach((b, idx) => {
    if (idx === correctIndex) {
      b.style.backgroundColor = "#c8f7c5"; // greenish
    } else if (idx === selectedIndex) {
      b.style.backgroundColor = "#f7c5c5"; // redish
    }
  });

  quizFeedbackEl.innerText = isCorrect
    ? "Correct! ✅"
    : `Wrong. Correct answer: ${String.fromCharCode(65 + correctIndex)}.`;

  quizProgressEl.innerText = `Question ${currentQuestionIndex + 1} of ${
    quizData.length
  } | Score: ${score}`;

  if (currentQuestionIndex < quizData.length - 1) {
    nextQuestionBtn.style.display = "inline-block";
  } else {
    nextQuestionBtn.style.display = "none";
    quizFeedbackEl.innerText += "\nQuiz finished!";
  }
};

nextQuestionBtn.onclick = () => {
  if (currentQuestionIndex < quizData.length - 1) {
    currentQuestionIndex++;
    renderQuestion();
  }
};

// QUIZ button click
document.getElementById("quizBtn").onclick = () => {
  getSelectedText(async (text) => {
    if (!ensureTextSelected(text)) return;

    const countInput = document.getElementById("quizCount");
    const numQ = Math.max(1, Math.min(20, Number(countInput.value) || 5));

    setOutput(`Generating ${numQ} MCQs...`);
    hideQuizArea();
    quizData = [];
    currentQuestionIndex = 0;
    score = 0;

    try {
      const data = await callBackend("/quiz", { text, count: numQ });
      if (!data.quiz || !Array.isArray(data.quiz) || !data.quiz.length) {
        setOutput("Failed to generate quiz.");
        return;
      }
      quizData = data.quiz;
      setOutput("Quiz generated. Answer questions below:");
      showQuizArea();
      renderQuestion();
    } catch (e) {
      setOutput("Error: " + e.message);
    }
  });
};
