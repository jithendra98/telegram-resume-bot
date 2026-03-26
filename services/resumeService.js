const { callGeminiWithRetry } = require('./geminiHelper');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * Generate an optimized resume using Gemini AI
 */
async function generateOptimizedResume(jdText, resumeText, analysisResult) {
    const systemInstruction = `You are a professional resume writer. Given a job description, original resume, and analysis results, create an OPTIMIZED resume that:
1. Incorporates missing keywords naturally
2. Highlights relevant skills and experience
3. Uses strong action verbs
4. Is ATS-friendly
5. Keeps factual content from the original resume (don't fabricate experience)

Return ONLY a valid JSON object with this shape:
{
  "name": "string",
  "title": "string (target role)",
  "contact": { "email": "string", "phone": "string", "location": "string", "linkedin": "string" },
  "summary": "string (3-4 sentence professional summary tailored to JD)",
  "skills": ["string array of relevant skills"],
  "experience": [
    { "role": "string", "company": "string", "duration": "string", "bullets": ["string array of achievement bullets"] }
  ],
  "education": [
    { "degree": "string", "institution": "string", "year": "string" }
  ],
  "certifications": ["string array"],
  "projects": [
    { "name": "string", "description": "string" }
  ]
}`;

    const prompt = `Job Description:\n${jdText}\n\nOriginal Resume:\n${resumeText}\n\nAnalysis Results:\nMissing Keywords: ${analysisResult.missing_keywords?.join(', ')}\nImprovement Tips: ${analysisResult.improvement_tips?.join('; ')}`;

    return callGeminiWithRetry(systemInstruction, prompt, true);
}

/**
 * Generate HTML for a resume in the specified format
 */
function generateResumeHTML(data, format) {
    switch (format) {
        case 'classic': return classicTemplate(data);
        case 'modern': return modernTemplate(data);
        case 'ats': return atsTemplate(data);
        default: return classicTemplate(data);
    }
}

function classicTemplate(d) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    @import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&family=Open+Sans:wght@400;600&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Open Sans', serif; color: #333; padding: 40px 50px; max-width: 800px; margin: auto; line-height: 1.5; }
    h1 { font-family: 'Merriweather', serif; font-size: 26px; color: #1a1a2e; border-bottom: 2px solid #1a1a2e; padding-bottom: 8px; margin-bottom: 4px; }
    .title { font-size: 14px; color: #555; margin-bottom: 6px; }
    .contact { font-size: 11px; color: #666; margin-bottom: 16px; }
    h2 { font-family: 'Merriweather', serif; font-size: 15px; color: #1a1a2e; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin: 16px 0 8px 0; text-transform: uppercase; letter-spacing: 1px; }
    .summary { font-size: 12px; color: #444; margin-bottom: 8px; font-style: italic; }
    .job { margin-bottom: 12px; }
    .job-header { display: flex; justify-content: space-between; align-items: baseline; }
    .job-title { font-weight: 700; font-size: 13px; }
    .job-company { font-size: 12px; color: #555; }
    .job-duration { font-size: 11px; color: #777; }
    ul { margin-left: 18px; margin-top: 4px; }
    li { font-size: 12px; margin-bottom: 3px; }
    .skills-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .skill-tag { background: #f0f0f0; padding: 3px 10px; border-radius: 3px; font-size: 11px; }
    .edu-item, .cert-item, .proj-item { font-size: 12px; margin-bottom: 4px; }
    .proj-desc { font-size: 11px; color: #555; }
    </style></head><body>
    <h1>${d.name || 'Your Name'}</h1>
    <div class="title">${d.title || ''}</div>
    <div class="contact">${[d.contact?.email, d.contact?.phone, d.contact?.location, d.contact?.linkedin].filter(Boolean).join(' | ')}</div>
    ${d.summary ? `<h2>Professional Summary</h2><div class="summary">${d.summary}</div>` : ''}
    ${d.skills?.length ? `<h2>Skills</h2><div class="skills-list">${d.skills.map(s => `<span class="skill-tag">${s}</span>`).join('')}</div>` : ''}
    ${d.experience?.length ? `<h2>Experience</h2>${d.experience.map(e => `<div class="job"><div class="job-header"><div><span class="job-title">${e.role}</span> <span class="job-company">| ${e.company}</span></div><span class="job-duration">${e.duration}</span></div><ul>${e.bullets?.map(b => `<li>${b}</li>`).join('') || ''}</ul></div>`).join('')}` : ''}
    ${d.education?.length ? `<h2>Education</h2>${d.education.map(e => `<div class="edu-item"><strong>${e.degree}</strong> — ${e.institution} (${e.year})</div>`).join('')}` : ''}
    ${d.certifications?.length ? `<h2>Certifications</h2>${d.certifications.map(c => `<div class="cert-item">• ${c}</div>`).join('')}` : ''}
    ${d.projects?.length ? `<h2>Projects</h2>${d.projects.map(p => `<div class="proj-item"><strong>${p.name}</strong><div class="proj-desc">${p.description}</div></div>`).join('')}` : ''}
    </body></html>`;
}

function modernTemplate(d) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; color: #333; display: flex; max-width: 800px; margin: auto; }
    .sidebar { width: 250px; background: #1a1a2e; color: #fff; padding: 30px 20px; min-height: 100vh; }
    .main { flex: 1; padding: 30px 30px; }
    .sidebar h1 { font-size: 22px; margin-bottom: 4px; color: #e94560; }
    .sidebar .title { font-size: 12px; color: #ccc; margin-bottom: 16px; }
    .sidebar h3 { font-size: 12px; color: #e94560; text-transform: uppercase; letter-spacing: 1px; margin: 14px 0 6px 0; border-bottom: 1px solid #e94560; padding-bottom: 3px; }
    .sidebar .contact-item { font-size: 11px; color: #ddd; margin-bottom: 4px; }
    .sidebar .skill-tag { display: inline-block; background: rgba(233,69,96,0.2); color: #fff; padding: 2px 8px; border-radius: 10px; font-size: 10px; margin: 2px; }
    .main h2 { font-size: 14px; color: #1a1a2e; border-bottom: 2px solid #e94560; padding-bottom: 4px; margin: 14px 0 8px 0; text-transform: uppercase; letter-spacing: 1px; }
    .summary { font-size: 12px; color: #555; margin-bottom: 8px; }
    .job { margin-bottom: 12px; }
    .job-title { font-weight: 700; font-size: 13px; color: #1a1a2e; }
    .job-meta { font-size: 11px; color: #777; margin-bottom: 4px; }
    ul { margin-left: 16px; }
    li { font-size: 11px; margin-bottom: 2px; }
    .edu-item { font-size: 12px; margin-bottom: 4px; }
    .proj-item { font-size: 12px; margin-bottom: 6px; }
    .proj-desc { font-size: 11px; color: #666; }
    </style></head><body>
    <div class="sidebar">
        <h1>${d.name || 'Your Name'}</h1>
        <div class="title">${d.title || ''}</div>
        <h3>Contact</h3>
        ${d.contact?.email ? `<div class="contact-item">📧 ${d.contact.email}</div>` : ''}
        ${d.contact?.phone ? `<div class="contact-item">📱 ${d.contact.phone}</div>` : ''}
        ${d.contact?.location ? `<div class="contact-item">📍 ${d.contact.location}</div>` : ''}
        ${d.contact?.linkedin ? `<div class="contact-item">🔗 ${d.contact.linkedin}</div>` : ''}
        ${d.skills?.length ? `<h3>Skills</h3><div>${d.skills.map(s => `<span class="skill-tag">${s}</span>`).join(' ')}</div>` : ''}
        ${d.certifications?.length ? `<h3>Certifications</h3>${d.certifications.map(c => `<div class="contact-item">✓ ${c}</div>`).join('')}` : ''}
    </div>
    <div class="main">
        ${d.summary ? `<h2>Summary</h2><div class="summary">${d.summary}</div>` : ''}
        ${d.experience?.length ? `<h2>Experience</h2>${d.experience.map(e => `<div class="job"><div class="job-title">${e.role}</div><div class="job-meta">${e.company} | ${e.duration}</div><ul>${e.bullets?.map(b => `<li>${b}</li>`).join('') || ''}</ul></div>`).join('')}` : ''}
        ${d.education?.length ? `<h2>Education</h2>${d.education.map(e => `<div class="edu-item"><strong>${e.degree}</strong> — ${e.institution} (${e.year})</div>`).join('')}` : ''}
        ${d.projects?.length ? `<h2>Projects</h2>${d.projects.map(p => `<div class="proj-item"><strong>${p.name}</strong><div class="proj-desc">${p.description}</div></div>`).join('')}` : ''}
    </div>
    </body></html>`;
}

function atsTemplate(d) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; padding: 40px 50px; max-width: 800px; margin: auto; line-height: 1.6; }
    h1 { font-size: 22px; text-align: center; margin-bottom: 2px; }
    .title { font-size: 13px; text-align: center; color: #333; margin-bottom: 4px; }
    .contact { font-size: 11px; text-align: center; color: #444; margin-bottom: 14px; }
    h2 { font-size: 14px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 3px; margin: 14px 0 6px 0; }
    .summary { font-size: 12px; margin-bottom: 8px; }
    .skills-text { font-size: 12px; margin-bottom: 8px; }
    .job { margin-bottom: 10px; }
    .job-line { font-size: 12px; font-weight: bold; }
    .job-meta { font-size: 11px; color: #333; }
    ul { margin-left: 18px; }
    li { font-size: 12px; margin-bottom: 2px; }
    .edu-item { font-size: 12px; margin-bottom: 3px; }
    .proj-item { font-size: 12px; margin-bottom: 4px; }
    </style></head><body>
    <h1>${d.name || 'YOUR NAME'}</h1>
    <div class="title">${d.title || ''}</div>
    <div class="contact">${[d.contact?.email, d.contact?.phone, d.contact?.location, d.contact?.linkedin].filter(Boolean).join(' | ')}</div>
    ${d.summary ? `<h2>Professional Summary</h2><div class="summary">${d.summary}</div>` : ''}
    ${d.skills?.length ? `<h2>Skills</h2><div class="skills-text">${d.skills.join(', ')}</div>` : ''}
    ${d.experience?.length ? `<h2>Professional Experience</h2>${d.experience.map(e => `<div class="job"><div class="job-line">${e.role} — ${e.company}</div><div class="job-meta">${e.duration}</div><ul>${e.bullets?.map(b => `<li>${b}</li>`).join('') || ''}</ul></div>`).join('')}` : ''}
    ${d.education?.length ? `<h2>Education</h2>${d.education.map(e => `<div class="edu-item">${e.degree} — ${e.institution}, ${e.year}</div>`).join('')}` : ''}
    ${d.certifications?.length ? `<h2>Certifications</h2>${d.certifications.map(c => `<div class="edu-item">${c}</div>`).join('')}` : ''}
    ${d.projects?.length ? `<h2>Projects</h2>${d.projects.map(p => `<div class="proj-item"><strong>${p.name}:</strong> ${p.description}</div>`).join('')}` : ''}
    </body></html>`;
}

/**
 * Convert HTML to PDF using Puppeteer
 */
async function htmlToPdf(html, outputPath) {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
        path: outputPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' }
    });
    await browser.close();
}

module.exports = {
    generateOptimizedResume,
    generateResumeHTML,
    htmlToPdf,
};
