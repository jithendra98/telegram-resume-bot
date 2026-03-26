# ResumeMatch AI — Telegram Bot 🤖

An AI-powered Telegram bot that analyzes resumes against job descriptions, generates optimized resumes, conducts mock interviews, and more — powered by Google Gemini AI.

## Features

- 📊 **Resume Scoring** — Match resumes against job descriptions with detailed breakdowns
- 📄 **Resume Generation** — Classic, Modern, and ATS-friendly PDF formats
- 🎤 **Mock Interviews** — AI-driven 5-question interview sessions with scoring
- ✉️ **Cover Letters** — Tailored cover letter generation
- ❓ **Interview Prep** — Predict likely interview questions
- 📚 **Learning Paths** — Personalized skill-gap analysis
- 💬 **AI Chat** — Ask career and resume questions

## Setup

1. Clone this repo and install dependencies:
   ```bash
   git clone <your-repo-url>
   cd telegram-resume-bot
   npm install
   ```

2. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```

3. Fill in your API keys in `.env`:
   - `TELEGRAM_BOT_TOKEN` — Get from [BotFather](https://t.me/botfather)
   - `GEMINI_API_KEY` — Get from [Google AI Studio](https://aistudio.google.com/)

4. Start the bot:
   ```bash
   npm start
   ```

## Deploy on Render (Free)

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → **New → Background Worker**
3. Connect your GitHub repo
4. Set **Build Command**: `npm install`
5. Set **Start Command**: `node bot.js`
6. Add environment variables: `TELEGRAM_BOT_TOKEN` and `GEMINI_API_KEY`
7. Deploy!

## Tech Stack

- Node.js + [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api)
- Google Gemini AI
- Puppeteer (PDF generation)
- pdf-parse & mammoth (document parsing)

## License

ISC
