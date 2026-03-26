const { callGeminiWithRetry } = require('./geminiHelper');

/**
 * Generate a tailored cover letter
 */
async function generateCoverLetter(jdText, resumeText) {
    const sys = `You are an expert career coach. Write a professional, compelling cover letter tailored to the job description using the candidate's resume. 3-4 paragraphs, strong hook, 2-3 achievements, enthusiasm, confident closing. Under 2500 characters. No placeholders. Return ONLY the letter text.`;
    let text = await callGeminiWithRetry(sys, `Job Description:\n${jdText}\n\nResume:\n${resumeText}`, false);
    if (text.length > 3800) text = text.substring(0, 3797) + '...';
    return text;
}

/**
 * Predict likely interview questions
 */
async function predictInterviewQuestions(jdText, resumeText, analysisResult) {
    const sys = `You are a senior technical interviewer. Predict 10 likely interview questions. Mix: 3 Technical, 3 Behavioral, 2 Scenario, 2 Gap questions. Return JSON array: [{"question":"string","category":"Technical|Behavioral|Scenario|Gap","why":"string","tip":"string"}]`;
    const missing = analysisResult?.missing_keywords?.join(', ') || 'none';
    return callGeminiWithRetry(sys, `Job Description:\n${jdText}\n\nResume:\n${resumeText}\n\nMissing: ${missing}`, true);
}

/**
 * Generate skill gap learning path
 */
async function generateLearningPath(missingKeywords, jdText) {
    const sys = `You are a learning advisor. For each missing skill, suggest: skill name, priority (High/Medium/Low), one free resource with URL, estimated learn time. Return JSON array: [{"skill":"string","priority":"High|Medium|Low","resource":"string","time":"string"}]. Max 8 items, sorted by priority.`;
    return callGeminiWithRetry(sys, `Missing Skills: ${missingKeywords.join(', ')}\n\nJob Description:\n${jdText}`, true);
}

/**
 * Mock interview - generate a question
 */
async function getInterviewQuestion(jdText, resumeText, questionNumber, previousQA) {
    const sys = `You are conducting a mock interview. Ask ONE interview question relevant to the job. Question ${questionNumber} of 5. Mix technical and behavioral. Don't repeat previous questions. Return ONLY the question text.`;
    let prompt = `Job Description:\n${jdText}\n\nResume:\n${resumeText}`;
    if (previousQA?.length) prompt += '\n\nPrevious: ' + previousQA.map(qa => `Q: ${qa.q}`).join('\n');
    const text = await callGeminiWithRetry(sys, prompt, false);
    return text.trim();
}

/**
 * Evaluate a mock interview answer
 */
async function evaluateAnswer(question, answer, jdText) {
    const sys = `Evaluate a mock interview answer. Return ONLY JSON: {"score": number(1-10), "feedback": "2-3 sentences", "better_answer_tip": "1 sentence"}`;
    return callGeminiWithRetry(sys, `Question: ${question}\n\nAnswer: ${answer}\n\nJob: ${jdText.substring(0, 800)}`, true);
}

module.exports = { generateCoverLetter, predictInterviewQuestions, generateLearningPath, getInterviewQuestion, evaluateAnswer };
