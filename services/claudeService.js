const { Anthropic } = require('@anthropic-ai/sdk');

// We initialize without the token here but rely on process.env.ANTHROPIC_API_KEY being set in bot.js
let anthropic;

function initialize() {
    anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
    });
}

/**
 * Analyzes resume against job description using Claude API
 * @param {string} jdText 
 * @param {string} resumeText 
 * @returns {Promise<Object>} 
 */
async function analyzeResume(jdText, resumeText) {
  if (!anthropic) {
    initialize();
  }

  const systemPrompt = `You are a professional ATS resume analyzer. Given a job description and a resume, return ONLY a valid JSON object with this exact shape:
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

  const userPrompt = `Job Description:
${jdText}

Resume:
${resumeText}`;

  try {
    // using claude-3-7-sonnet-20250219 or claude-3-5-sonnet-20241022 
    // using latest 3.7 sonnet per best practices
    const message = await anthropic.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 1500,
      system: systemPrompt,
      temperature: 0.1,
      messages: [
        { role: 'user', content: userPrompt }
      ]
    });

    const responseText = message.content[0].text;
    // Clean markdown code blocks from the response
    const jsonString = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Claude API Error:', error);
    throw error;
  }
}

module.exports = {
  analyzeResume,
};
