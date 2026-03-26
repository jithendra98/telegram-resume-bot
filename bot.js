require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { extractText } = require('./services/parseService');
const { analyzeResume, chatWithAI } = require('./services/geminiService');
const { generateOptimizedResume, generateResumeHTML, htmlToPdf } = require('./services/resumeService');
const { generateCoverLetter, predictInterviewQuestions, generateLearningPath, getInterviewQuestion, evaluateAnswer } = require('./services/advancedService');

// Prevent crashes
process.on('uncaughtException', (err) => console.error('Uncaught:', err));
process.on('unhandledRejection', (err) => console.error('Unhandled:', err));

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token || token === 'your_telegram_bot_token_here') { console.error('❌ TELEGRAM_BOT_TOKEN missing'); process.exit(1); }
if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') { console.error('❌ GEMINI_API_KEY missing'); process.exit(1); }

const bot = new TelegramBot(token, {
    polling: {
        interval: 1000,
        autoStart: true,
        params: { timeout: 30 }
    }
});

// ─── Polling error recovery (prevents bot from stopping after 2-5 min) ───
bot.on('polling_error', (error) => {
    const msg = error?.message || '';
    console.error('Polling error:', msg.substring(0, 200));

    // 409 = another bot instance is running with the same token
    if (msg.includes('409')) {
        console.error('❌ CONFLICT: Another bot instance is running! Stop the other one first.');
        // Don't exit — just log it. The polling will retry.
    }

    // 401 = invalid token
    if (msg.includes('401')) {
        console.error('❌ FATAL: Invalid bot token!');
        process.exit(1);
    }
});
const sessions = new Map();
const downloadDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

// ─── Register bot commands menu ───
bot.setMyCommands([
    { command: 'start', description: '🚀 Start resume analysis' },
    { command: 'help', description: '📖 View all features & commands' },
    { command: 'ask', description: '💬 Ask career/resume questions' },
    { command: 'interview', description: '🎤 Start mock interview' },
    { command: 'cover', description: '✉️ Generate cover letter' },
    { command: 'questions', description: '❓ Predict interview questions' },
    { command: 'learn', description: '📚 Skill gap learning path' },
    { command: 'new', description: '🔄 Start fresh analysis' },
]);

// ─── Utilities ───
function safeCleanup(filePath) {
    setTimeout(() => {
        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {
            setTimeout(() => { try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {} }, 5000);
        }
    }, 2000);
}

function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(destPath);
        client.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                file.close(); fs.unlinkSync(destPath);
                return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
            }
            response.pipe(file);
            file.on('finish', () => file.close(resolve));
        }).on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
    });
}

function requireSession(chatId, msg) {
    const session = sessions.get(chatId);
    if (!session || !session.jdText || !session.resumeText) {
        bot.sendMessage(chatId, '⚠️ You need to analyze a resume first!\n\nUse /start to begin by pasting a Job Description and uploading your resume.');
        return null;
    }
    return session;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMMANDS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ─── /start ───
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    sessions.set(chatId, { state: 'AWAITING_JD' });
    bot.sendMessage(chatId,
`👋 <b>Welcome to ResumeMatch AI!</b>

🤖 Your AI-powered career companion that helps you:
✅ Score resumes against job descriptions
📄 Generate optimized resumes in multiple formats
🎤 Practice with mock interviews
✉️ Create tailored cover letters
❓ Predict likely interview questions
📚 Get personalized learning paths

<b>━━━ Getting Started ━━━</b>
📋 <b>Step 1:</b> Paste your <b>Job Description</b> below

Type /help to see all available commands.`, { parse_mode: 'HTML' });
});

// ─── /help ───
bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id,
`📖 <b>ResumeMatch AI — Full Feature Guide</b>

<b>━━━ Core Features ━━━</b>
/start — Begin resume analysis flow
/new — Reset and start a fresh analysis

<b>━━━ AI Tools (need analysis first) ━━━</b>
/cover — ✉️ Generate a tailored cover letter
/questions — ❓ Predict 10 likely interview questions
/interview — 🎤 5-question mock interview with scoring
/learn — 📚 Personalized skill gap learning path

<b>━━━ Chat ━━━</b>
/ask — 💬 Ask anything about careers, resumes, tips

<b>━━━ How It Works ━━━</b>
1️⃣ Paste a Job Description
2️⃣ Upload your Resume (PDF/DOCX/TXT)
3️⃣ Get AI-powered analysis with scores
4️⃣ Export optimized resumes (Classic/Modern/ATS)
5️⃣ Use any tool above for deeper insights!

<i>Powered by Google Gemini AI 🧠</i>`, { parse_mode: 'HTML' });
});

// ─── /new ───
bot.onText(/\/new/, (msg) => {
    sessions.set(msg.chat.id, { state: 'AWAITING_JD' });
    bot.sendMessage(msg.chat.id, '🔄 Session reset! Paste a new Job Description to begin.');
});

// ─── /ask ───
bot.onText(/\/ask(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const question = (match[1] || '').trim();
    const session = sessions.get(chatId) || {};
    if (!question) {
        sessions.set(chatId, { ...session, state: 'CHATTING' });
        return bot.sendMessage(chatId, '💬 Ask me anything! Type your question below:');
    }
    await bot.sendMessage(chatId, '🤔 Thinking...');
    try {
        const answer = await chatWithAI(question, session);
        await bot.sendMessage(chatId, answer);
    } catch (err) { await bot.sendMessage(chatId, '❌ ' + err.message); }
});

// ─── /cover — Cover Letter Generator ───
bot.onText(/\/cover/, async (msg) => {
    const chatId = msg.chat.id;
    const session = requireSession(chatId);
    if (!session) return;

    await bot.sendMessage(chatId, '✉️ Generating your tailored cover letter...');
    try {
        const letter = await generateCoverLetter(session.jdText, session.resumeText);
        await bot.sendMessage(chatId, `✉️ <b>Your Cover Letter</b>\n\n${letter}`, { parse_mode: 'HTML' });
    } catch (err) {
        console.error('Cover letter error:', err.message);
        await bot.sendMessage(chatId, '❌ Failed to generate cover letter: ' + err.message);
    }
});

// ─── /questions — Interview Question Predictor ───
bot.onText(/\/questions/, async (msg) => {
    const chatId = msg.chat.id;
    const session = requireSession(chatId);
    if (!session) return;

    await bot.sendMessage(chatId, '❓ Predicting interview questions you might face...');
    try {
        const questions = await predictInterviewQuestions(session.jdText, session.resumeText, session.analysisResult);
        const categoryIcons = { 'Technical': '💻', 'Behavioral': '🧠', 'Scenario': '🎯', 'Gap': '⚠️' };

        // Split into 2 messages to avoid length limit
        const half = Math.ceil(questions.length / 2);
        const chunks = [questions.slice(0, half), questions.slice(half)];

        for (let i = 0; i < chunks.length; i++) {
            const text = chunks[i].map((q, idx) => {
                const num = i * half + idx + 1;
                const icon = categoryIcons[q.category] || '❓';
                return `<b>${num}. ${icon} [${q.category}]</b>\n${q.question}\n<i>Why: ${q.why}</i>\n💡 <i>${q.tip}</i>`;
            }).join('\n\n');

            await bot.sendMessage(chatId,
                i === 0 ? `❓ <b>Predicted Interview Questions</b>\n\n${text}` : text,
                { parse_mode: 'HTML' }
            );
        }
    } catch (err) {
        console.error('Questions error:', err.message);
        await bot.sendMessage(chatId, '❌ Failed to predict questions: ' + err.message);
    }
});

// ─── /learn — Skill Gap Learning Path ───
bot.onText(/\/learn/, async (msg) => {
    const chatId = msg.chat.id;
    const session = requireSession(chatId);
    if (!session || !session.analysisResult?.missing_keywords?.length) {
        return bot.sendMessage(chatId, '✅ No skill gaps found! Your resume already covers the key skills.');
    }

    await bot.sendMessage(chatId, '📚 Building your personalized learning path...');
    try {
        const path = await generateLearningPath(session.analysisResult.missing_keywords, session.jdText);
        const priorityIcons = { 'High': '🔴', 'Medium': '🟡', 'Low': '🟢' };

        const text = path.map((item, i) => {
            const icon = priorityIcons[item.priority] || '⚪';
            return `<b>${i + 1}. ${item.skill}</b> ${icon} ${item.priority}\n📎 ${item.resource}\n⏱️ ${item.time}`;
        }).join('\n\n');

        await bot.sendMessage(chatId, `📚 <b>Skill Gap Learning Path</b>\n\n${text}`, { parse_mode: 'HTML' });
    } catch (err) {
        console.error('Learning path error:', err.message);
        await bot.sendMessage(chatId, '❌ Failed to generate learning path: ' + err.message);
    }
});

// ─── /interview — Mock Interview Mode ───
bot.onText(/\/interview/, async (msg) => {
    const chatId = msg.chat.id;
    const session = requireSession(chatId);
    if (!session) return;

    await bot.sendMessage(chatId,
`🎤 <b>Mock Interview Mode</b>

I'll ask you 5 interview questions based on the job description. After each answer, I'll score you and give feedback.

<b>Rules:</b>
• Answer as if you're in a real interview
• Take your time, be specific
• Use the STAR method for behavioral questions

Ready? Here comes Question 1...`, { parse_mode: 'HTML' });

    try {
        const question = await getInterviewQuestion(session.jdText, session.resumeText, 1, []);
        sessions.set(chatId, {
            ...session,
            state: 'MOCK_INTERVIEW',
            interviewQA: [],
            currentQuestion: question,
            questionNumber: 1,
            totalScore: 0
        });
        await bot.sendMessage(chatId, `❓ <b>Question 1/5:</b>\n\n${question}`, { parse_mode: 'HTML' });
    } catch (err) {
        console.error('Interview start error:', err.message);
        await bot.sendMessage(chatId, '❌ Failed to start interview: ' + err.message);
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MESSAGE HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (msg.text && msg.text.startsWith('/')) return;

    let session = sessions.get(chatId);
    if (!session) {
        sessions.set(chatId, { state: 'AWAITING_JD' });
        session = sessions.get(chatId);
    }

    try {
        // ─── JD Input ───
        if (session.state === 'AWAITING_JD') {
            if (!msg.text) return bot.sendMessage(chatId, '⚠️ Please send the Job Description as text.');
            sessions.set(chatId, { jdText: msg.text, state: 'AWAITING_RESUME' });
            return bot.sendMessage(chatId, '✅ Job Description saved!\n\n📄 <b>Step 2:</b> Upload your <b>Resume</b> (PDF, DOCX, or TXT).', { parse_mode: 'HTML' });
        }

        // ─── Resume Upload ───
        if (session.state === 'AWAITING_RESUME') {
            if (!msg.document) return bot.sendMessage(chatId, '⚠️ Please upload a document (PDF, DOCX, or TXT).');

            const doc = msg.document;
            const fileName = doc.file_name || 'unknown.pdf';
            const ext = path.extname(fileName).toLowerCase();
            if (!['.pdf', '.docx', '.doc', '.txt'].includes(ext)) return bot.sendMessage(chatId, '⚠️ Unsupported format.');

            await bot.sendMessage(chatId, '⏳ Analyzing your resume with AI...');

            const fileLink = await bot.getFileLink(doc.file_id);
            const localFilePath = path.join(downloadDir, `${chatId}_${Date.now()}${ext}`);
            await downloadFile(fileLink, localFilePath);

            let resumeText;
            try {
                resumeText = await extractText(localFilePath);
            } catch (err) {
                safeCleanup(localFilePath);
                return bot.sendMessage(chatId, '❌ Could not parse the file. Try a different format.');
            }
            safeCleanup(localFilePath);

            if (!resumeText?.trim()) return bot.sendMessage(chatId, '❌ No text found in document.');

            let result;
            try {
                result = await analyzeResume(session.jdText, resumeText);
            } catch (err) {
                return bot.sendMessage(chatId, '❌ AI analysis failed: ' + err.message);
            }

            // Send results
            const msgs = formatResponse(result);
            for (const m of msgs) await bot.sendMessage(chatId, m, { parse_mode: 'HTML' });

            // Store full context
            sessions.set(chatId, { ...session, resumeText, analysisResult: result, state: 'AWAITING_FORMAT' });

            // Action buttons
            await bot.sendMessage(chatId, '⚡ <b>What would you like to do next?</b>', {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📜 Classic Resume', callback_data: 'resume_classic' },
                            { text: '🎨 Modern Resume', callback_data: 'resume_modern' },
                        ],
                        [
                            { text: '🤖 ATS Resume', callback_data: 'resume_ats' },
                            { text: '📦 All Formats', callback_data: 'resume_all' },
                        ],
                        [
                            { text: '✉️ Cover Letter', callback_data: 'action_cover' },
                            { text: '❓ Interview Qs', callback_data: 'action_questions' },
                        ],
                        [
                            { text: '🎤 Mock Interview', callback_data: 'action_interview' },
                            { text: '📚 Learning Path', callback_data: 'action_learn' },
                        ],
                        [
                            { text: '💬 Ask Questions', callback_data: 'action_chat' },
                            { text: '⏭️ Skip', callback_data: 'resume_skip' },
                        ]
                    ]
                }
            });
            return;
        }

        // ─── Mock Interview Answer Handling ───
        if (session.state === 'MOCK_INTERVIEW') {
            if (!msg.text) return bot.sendMessage(chatId, '⚠️ Please type your answer.');

            await bot.sendMessage(chatId, '📝 Evaluating your answer...');

            try {
                const evaluation = await evaluateAnswer(session.currentQuestion, msg.text, session.jdText);
                const scoreIcon = evaluation.score >= 7 ? '🟢' : evaluation.score >= 5 ? '🟡' : '🔴';

                await bot.sendMessage(chatId,
`${scoreIcon} <b>Score: ${evaluation.score}/10</b>

💬 <b>Feedback:</b> ${evaluation.feedback}

💡 <b>Tip:</b> ${evaluation.better_answer_tip}`, { parse_mode: 'HTML' });

                const qa = [...(session.interviewQA || []), { q: session.currentQuestion, a: msg.text, score: evaluation.score }];
                const newTotal = (session.totalScore || 0) + evaluation.score;
                const qNum = (session.questionNumber || 1) + 1;

                if (qNum > 5) {
                    // Interview complete
                    const avgScore = (newTotal / 5).toFixed(1);
                    const verdict = avgScore >= 7 ? '🏆 Excellent! You\'re well prepared!' :
                                   avgScore >= 5 ? '👍 Good effort! Some areas to improve.' :
                                   '💪 Keep practicing! Review the tips above.';

                    await bot.sendMessage(chatId,
`🎤 <b>Mock Interview Complete!</b>

📊 <b>Average Score: ${avgScore}/10</b>
${verdict}

<b>Question-by-Question:</b>
${qa.map((item, i) => `${i+1}. ${item.score >= 7 ? '🟢' : item.score >= 5 ? '🟡' : '🔴'} ${item.score}/10`).join('\n')}`, { parse_mode: 'HTML', reply_markup: {
                        inline_keyboard: [[
                            { text: '🔄 Retry Interview', callback_data: 'action_interview' },
                            { text: '💬 Ask Questions', callback_data: 'action_chat' },
                            { text: '🔄 New Analysis', callback_data: 'action_new' },
                        ]]
                    }});

                    sessions.set(chatId, { ...session, interviewQA: qa, state: 'CHATTING' });
                } else {
                    // Next question
                    const nextQ = await getInterviewQuestion(session.jdText, session.resumeText, qNum, qa);
                    sessions.set(chatId, { ...session, interviewQA: qa, currentQuestion: nextQ, questionNumber: qNum, totalScore: newTotal, state: 'MOCK_INTERVIEW' });
                    await bot.sendMessage(chatId, `❓ <b>Question ${qNum}/5:</b>\n\n${nextQ}`, { parse_mode: 'HTML' });
                }
            } catch (err) {
                console.error('Interview eval error:', err.message);
                await bot.sendMessage(chatId, '❌ Evaluation failed: ' + err.message);
            }
            return;
        }

        // ─── Chat Mode ───
        if (session.state === 'CHATTING') {
            if (!msg.text) return bot.sendMessage(chatId, '⚠️ Please type your question.');
            await bot.sendMessage(chatId, '🤔 Thinking...');
            try {
                const answer = await chatWithAI(msg.text, session);
                await bot.sendMessage(chatId, answer);
                await bot.sendMessage(chatId, '💬 Ask another question or pick an action:', {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🔄 New Analysis', callback_data: 'action_new' },
                            { text: '🎤 Mock Interview', callback_data: 'action_interview' },
                            { text: '✉️ Cover Letter', callback_data: 'action_cover' },
                        ]]
                    }
                });
            } catch (err) { await bot.sendMessage(chatId, '❌ ' + err.message); }
            return;
        }

    } catch (error) {
        console.error(`[${chatId}] Error:`, error);
        bot.sendMessage(chatId, '❌ Error: ' + error.message).catch(() => {});
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CALLBACK QUERY HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const session = sessions.get(chatId) || {};

    await bot.answerCallbackQuery(query.id);

    // Action routing
    if (data === 'action_new') {
        sessions.set(chatId, { state: 'AWAITING_JD' });
        return bot.sendMessage(chatId, '🔄 Paste a new Job Description to begin.');
    }
    if (data === 'action_chat') {
        sessions.set(chatId, { ...session, state: 'CHATTING' });
        return bot.sendMessage(chatId, '💬 Go ahead, ask me anything!');
    }
    if (data === 'action_cover') {
        if (!session.jdText || !session.resumeText) return bot.sendMessage(chatId, '⚠️ Use /start first.');
        await bot.sendMessage(chatId, '✉️ Generating cover letter...');
        try {
            const letter = await generateCoverLetter(session.jdText, session.resumeText);
            await bot.sendMessage(chatId, `✉️ <b>Your Cover Letter</b>\n\n${letter}`, { parse_mode: 'HTML' });
        } catch (err) { await bot.sendMessage(chatId, '❌ ' + err.message); }
        return;
    }
    if (data === 'action_questions') {
        if (!session.jdText || !session.resumeText) return bot.sendMessage(chatId, '⚠️ Use /start first.');
        await bot.sendMessage(chatId, '❓ Predicting interview questions...');
        try {
            const questions = await predictInterviewQuestions(session.jdText, session.resumeText, session.analysisResult);
            const icons = { 'Technical': '💻', 'Behavioral': '🧠', 'Scenario': '🎯', 'Gap': '⚠️' };
            const half = Math.ceil(questions.length / 2);
            for (let i = 0; i < 2; i++) {
                const chunk = questions.slice(i * half, (i + 1) * half);
                const text = chunk.map((q, idx) => {
                    const num = i * half + idx + 1;
                    return `<b>${num}. ${icons[q.category] || '❓'} [${q.category}]</b>\n${q.question}\n<i>Why: ${q.why}</i>\n💡 <i>${q.tip}</i>`;
                }).join('\n\n');
                await bot.sendMessage(chatId, i === 0 ? `❓ <b>Predicted Interview Questions</b>\n\n${text}` : text, { parse_mode: 'HTML' });
            }
        } catch (err) { await bot.sendMessage(chatId, '❌ ' + err.message); }
        return;
    }
    if (data === 'action_interview') {
        if (!session.jdText || !session.resumeText) return bot.sendMessage(chatId, '⚠️ Use /start first.');
        await bot.sendMessage(chatId, '🎤 Starting mock interview...');
        try {
            const q = await getInterviewQuestion(session.jdText, session.resumeText, 1, []);
            sessions.set(chatId, { ...session, state: 'MOCK_INTERVIEW', interviewQA: [], currentQuestion: q, questionNumber: 1, totalScore: 0 });
            await bot.sendMessage(chatId, `❓ <b>Question 1/5:</b>\n\n${q}`, { parse_mode: 'HTML' });
        } catch (err) { await bot.sendMessage(chatId, '❌ ' + err.message); }
        return;
    }
    if (data === 'action_learn') {
        if (!session.analysisResult?.missing_keywords?.length) return bot.sendMessage(chatId, '✅ No skill gaps found!');
        await bot.sendMessage(chatId, '📚 Building learning path...');
        try {
            const lp = await generateLearningPath(session.analysisResult.missing_keywords, session.jdText);
            const icons = { 'High': '🔴', 'Medium': '🟡', 'Low': '🟢' };
            const text = lp.map((item, i) => `<b>${i + 1}. ${item.skill}</b> ${icons[item.priority] || '⚪'} ${item.priority}\n📎 ${item.resource}\n⏱️ ${item.time}`).join('\n\n');
            await bot.sendMessage(chatId, `📚 <b>Learning Path</b>\n\n${text}`, { parse_mode: 'HTML' });
        } catch (err) { await bot.sendMessage(chatId, '❌ ' + err.message); }
        return;
    }
    if (data === 'resume_skip') {
        sessions.set(chatId, { ...session, state: 'CHATTING' });
        return bot.sendMessage(chatId, '⏭️ What else can I help with?', {
            reply_markup: {
                inline_keyboard: [[
                    { text: '✉️ Cover Letter', callback_data: 'action_cover' },
                    { text: '🎤 Mock Interview', callback_data: 'action_interview' },
                    { text: '💬 Ask Questions', callback_data: 'action_chat' },
                ]]
            }
        });
    }

    // Resume format handling
    if (!data.startsWith('resume_')) return;
    if (!session.resumeText || !session.analysisResult) return bot.sendMessage(chatId, '⚠️ Session expired. Use /start.');

    const formats = data === 'resume_all' ? ['classic', 'modern', 'ats'] : [data.replace('resume_', '')];
    const labels = { classic: '📜 Classic', modern: '🎨 Modern', ats: '🤖 ATS-Friendly' };

    await bot.sendMessage(chatId, '⏳ Generating optimized resume(s)...');

    let optimizedData;
    try {
        optimizedData = await generateOptimizedResume(session.jdText, session.resumeText, session.analysisResult);
    } catch (err) {
        return bot.sendMessage(chatId, '❌ Resume generation failed: ' + err.message);
    }

    for (const format of formats) {
        try {
            const html = generateResumeHTML(optimizedData, format);
            const pdfPath = path.join(downloadDir, `${chatId}_${format}_${Date.now()}.pdf`);
            await htmlToPdf(html, pdfPath);
            await bot.sendDocument(chatId, pdfPath, { caption: `${labels[format]} Resume` }, { filename: `Resume_${format}.pdf`, contentType: 'application/pdf' });
            safeCleanup(pdfPath);
        } catch (err) {
            await bot.sendMessage(chatId, `❌ ${labels[format]} failed: ${err.message}`);
        }
    }

    await bot.sendMessage(chatId, '✅ Resume(s) sent! What else?', {
        reply_markup: {
            inline_keyboard: [[
                { text: '✉️ Cover Letter', callback_data: 'action_cover' },
                { text: '🎤 Mock Interview', callback_data: 'action_interview' },
                { text: '💬 Chat', callback_data: 'action_chat' },
            ]]
        }
    });
    sessions.set(chatId, { ...session, state: 'CHATTING' });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RESPONSE FORMATTER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function formatResponse(result) {
    const s = (score) => {
        if (typeof score !== 'number') return score;
        return score >= 70 ? `🟢 ${score}` : score >= 40 ? `🟡 ${score}` : `🔴 ${score}`;
    };

    const tips = (result.improvement_tips || []).slice(0, 5).map(t => `• ${t.length > 150 ? t.substring(0, 147) + '...' : t}`).join('\n') || 'None';
    let gap = result.gap_analysis || 'N/A';
    if (gap.length > 500) gap = gap.substring(0, 497) + '...';

    return [
        `📊 <b>Resume Analysis Results</b>

🏆 <b>Overall Score:</b> ${s(result.overall_score)}/100

📈 <b>Breakdown:</b>
• Skills Match: ${s(result.breakdown?.skills_match)}/100
• Experience: ${s(result.breakdown?.experience_relevance)}/100
• Education: ${s(result.breakdown?.education_fit)}/100
• Keywords: ${s(result.breakdown?.keywords_alignment)}/100

✅ <b>Matched:</b> ${(result.matched_keywords || []).slice(0, 15).join(', ') || 'None'}

❌ <b>Missing:</b> ${(result.missing_keywords || []).slice(0, 15).join(', ') || 'None'}`,

        `💡 <b>Improvement Tips:</b>
${tips}

🔍 <b>Gap Analysis:</b>
${gap}`
    ];
}

// ─── Health check server for Render free tier ───
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ResumeMatch AI Bot is running!');
}).listen(PORT, () => {
    console.log(`🌐 Health server on port ${PORT}`);
    console.log('🤖 ResumeMatch AI Bot is running with all features! Listening for messages...');
});
