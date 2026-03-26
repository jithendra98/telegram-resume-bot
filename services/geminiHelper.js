const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI;

function initialize() {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash-lite'];

/**
 * Call Gemini with automatic retry on 429 rate limit errors
 * Waits 10 seconds between retries, tries fallback models
 */
async function callGeminiWithRetry(systemInstruction, prompt, parseJson = false) {
    if (!genAI) initialize();

    for (const modelName of MODELS) {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                console.log(`[Gemini] ${modelName} attempt ${attempt + 1}`);
                const model = genAI.getGenerativeModel({ model: modelName, systemInstruction });
                const result = await model.generateContent(prompt);
                let text = result.response.text();

                if (parseJson) {
                    const jsonString = text.replace(/```json/gi, '').replace(/```/g, '').trim();
                    return JSON.parse(jsonString);
                }
                return text;
            } catch (error) {
                const is429 = error.message && error.message.includes('429');
                console.error(`[Gemini] ${modelName} attempt ${attempt + 1} failed:`, error.message?.substring(0, 100));

                if (is429 && attempt < 2) {
                    console.log('[Gemini] Rate limited, waiting 10s...');
                    await new Promise(r => setTimeout(r, 10000));
                    continue;
                }
                if (is429) {
                    console.log('[Gemini] Switching model...');
                    break;
                }
                throw error;
            }
        }
    }
    throw new Error('All AI models are rate-limited. Please wait a minute and try again.');
}

module.exports = { callGeminiWithRetry };
