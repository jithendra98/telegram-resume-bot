const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');

/**
 * Extract text from a PDF using Mozilla's pdfjs-dist
 */
async function extractPdfText(filePath) {
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

    const data = new Uint8Array(fs.readFileSync(filePath));
    const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
    
    let fullText = '';
    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
    }
    return fullText;
}

/**
 * Extracts text from a file (PDF, DOCX, or TXT)
 */
async function extractText(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    try {
        if (ext === '.pdf') {
            return await extractPdfText(filePath);
        } else if (ext === '.docx' || ext === '.doc') {
            const result = await mammoth.extractRawText({ path: filePath });
            return result.value;
        } else if (ext === '.txt') {
            return fs.readFileSync(filePath, 'utf8');
        } else {
            throw new Error(`Unsupported file type: ${ext}`);
        }
    } catch (error) {
        console.error('Error extracting text:', error.message);
        throw error;
    }
}

module.exports = { extractText };
