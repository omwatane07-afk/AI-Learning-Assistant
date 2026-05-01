# 🧠 AI-Learning-Assistant

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-18.x-green.svg)
![Express](https://img.shields.io/badge/Express-4.x-lightgrey.svg)
![Snowflake](https://img.shields.io/badge/Database-Snowflake-29B5E8.svg)

An AI-powered study assistant built as a browser extension with a Node.js backend. It leverages the **Perplexity API** to dynamically generate summaries, flashcards, and interactive quizzes from any highlighted webpage content, while securely logging user learning sessions into a **Snowflake** data warehouse.

---

## ✨ Features

- **📝 Content Summarization:** Select any text on a webpage and generate a concise, bulleted summary instantly.
- **🗂️ Flashcard Generation:** Automatically create Q&A style flashcards to aid in spaced repetition and active recall.
- **❓ Interactive Quizzes:** Test your knowledge with dynamically generated 5-question multiple-choice quizzes complete with answers.
- **📊 Learning History Tracking:** All study sessions, including generated materials and quiz scores, are logged and queryable via a Snowflake backend.

## 🛠️ Tech Stack

- **Frontend (Browser Extension):** HTML, CSS, Vanilla JavaScript, Chrome Extension APIs
- **Backend:** Node.js, Express.js
- **AI Integration:** Perplexity AI (Sonar model)
- **Database:** Snowflake Data Warehouse

## 📂 Project Structure

```text
AI-Learning-Assistant/
├── backend/            # Express.js server & API routes
│   └── server.js       # Main server entry point handling AI & Snowflake logic
├── extension/          # Chrome extension source files
│   ├── manifest.json   # Extension configuration
│   ├── popup.html      # Extension UI
│   └── popup.js        # Extension logic & backend communication
└── package.json        # Backend dependencies
```

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- A [Perplexity API Key](https://docs.perplexity.ai/)
- A [Snowflake](https://www.snowflake.com/) Account

### 1. Backend Setup

1. Clone the repository and navigate to the root directory:
   ```bash
   git clone https://github.com/yourusername/AI-Learning-Assistant.git
   cd AI-Learning-Assistant
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```env
   PORT=3000
   PPLX_API_KEY=your_perplexity_api_key

   # Snowflake Configuration
   SF_ACCOUNT=your_snowflake_account
   SF_USER=your_snowflake_user
   SF_PASSWORD=your_snowflake_password
   SF_WAREHOUSE=your_warehouse_name
   SF_DATABASE=your_database_name
   SF_SCHEMA=your_schema_name
   ```

4. Start the backend server:
   ```bash
   node backend/server.js
   ```

### 2. Extension Setup

1. Open your Chromium-based browser (Chrome, Edge, Brave).
2. Navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top right corner.
4. Click on **Load unpacked** and select the `extension/` folder from this repository.
5. The AI-Learning-Assistant icon will now appear in your browser toolbar.

## 💡 Usage

1. Highlight any text on a webpage.
2. Click the AI-Learning-Assistant extension icon.
3. The selected text will be automatically loaded into the extension.
4. Click **Summary**, **Flashcards**, or **Quiz** to generate study materials.
5. Click **History** to view your past learning sessions securely retrieved from Snowflake.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

Distributed under the MIT License. See `LICENSE` for more information.
