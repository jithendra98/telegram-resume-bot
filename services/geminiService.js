const { callGeminiWithRetry } = require('./geminiHelper');

/**
 * Analyzes resume against job description
 */
async function analyzeResume(jdText, resumeText) {
  const systemInstruction = `You are a professional ATS resume analyzer. Given a job description and a resume, return ONLY a valid JSON object with this exact shape:
{
  "overall_score": number (0-100),
  "breakdown": {
    "skills_match": number,
    "experience_relevance": number,
    "education_fit": number,
    "keywords_alignment": number
  },
  "matched_keywords": string[],
  "missing_keywords": string[],
  "improvement_tips": string[],
  "gap_analysis": string
}`;

  return callGeminiWithRetry(systemInstruction, `Job Description:\n${jdText}\n\nResume:\n${resumeText}`, true);
}

/**
 * Interactive chat - answer user questions with resume/JD context
 */
async function chatWithAI(question, context) {
  const systemInstruction = `You are ResumeMatch AI, a friendly and expert career advisor bot on Telegram. You help users improve their resumes, prepare for interviews, and understand job requirements.
You have context about the user's resume analysis. Use it to give specific, actionable advice. Be concise (under 3000 characters) but thorough. Use emojis occasionally. Format with plain text (no HTML/Markdown).
If the user asks something unrelated to careers/resumes, politely redirect them.`;

  let prompt = question;
  if (context.jdText) prompt += `\n\n[Job Description Context]: ${context.jdText.substring(0, 1500)}`;
  if (context.resumeText) prompt += `\n\n[Resume Context]: ${context.resumeText.substring(0, 1500)}`;
  if (context.analysisResult) prompt += `\n\n[Analysis Score]: ${context.analysisResult.overall_score}/100, Missing: ${(context.analysisResult.missing_keywords || []).join(', ')}`;

  try {
    let text = await callGeminiWithRetry(systemInstruction, prompt, false);
    if (text.length > 3800) text = text.substring(0, 3797) + '...';
    return text;
  } catch (error) {
    if (error.message.includes('rate-limited')) return '⏳ I\'m currently rate-limited. Please wait a minute and try again.';
    throw error;
  }
}

module.exports = { analyzeResume, chatWithAI };
