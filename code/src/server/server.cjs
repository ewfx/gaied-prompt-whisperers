require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const EmlParser = require('eml-parser');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const Tesseract = require('tesseract.js');
const { OpenAI } = require('openai');
const cors = require('cors');
const MsgReader = require('@kenjiuno/msgreader');

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EMAIL_FOLDER = path.resolve(__dirname, './emails');
// Read email files
function getEmailFiles() {
    return fs.readdirSync(EMAIL_FOLDER).filter(file => file.endsWith('.eml') || file.endsWith('.msg'));
}

async function parseEml(filePath) {
    const emlStream = fs.createReadStream(filePath);
    const parser = new EmlParser(emlStream);

    try {
        const email = await parser.parseEml();
        return {
            subject: email.subject || "No Subject",
            body: email.text || email.html || "No Body",
            attachments: email.attachments || []
        };
    } catch (err) {
        throw new Error(`Failed to parse EML file: ${err.message}`);
    }
}


// Parse MSG files
function parseMsg(filePath) {
    const buffer = fs.readFileSync(filePath);
    const msg = new MsgReader(buffer);
    const msgData = msg.getFileData();

    return {
        subject: msgData.subject || "No Subject",
        body: msgData.body || "No Body",
        attachments: msgData.attachments || []
    };
}

// Extract text from attachments
async function extractAttachmentText(attachment) {
    if (attachment.contentType.includes("pdf")) {
        try {
            return pdfParse(Buffer.from(attachment.content, 'base64')).then(data => data.text);
        } catch (error) {
            console.error(`Error parsing PDF attachment: ${error.message}`);
            return ""; // Return an empty string if parsing fails
        }
    } else if (attachment.contentType.includes("msword")) {
        return mammoth.extractRawText({ buffer: Buffer.from(attachment.content, 'base64') }).then(result => result.value);
    } else if (attachment.contentType.startsWith("image/")) {
        return Tesseract.recognize(Buffer.from(attachment.content, 'base64'), 'eng').then(({ data }) => data.text);
    }
    return "";
}

async function classifyRequest(emailContent) {
    const prompt = `
Analyze the email and attachments. Classify it into loan-related categories. Possible request types are like below and there can be more:
- Loan Completion
- Interest Rate Change
- Address Change
- Prepayment Charges
- Multiple Requests (list sub-request types if needed)
- Inbound money movement
- Outbound money movement  

Provide a JSON response like below and add more if found: {"requestType": "Loan Completion", "subRequestTypes": ["Address Change"], "confidenceScore": 0.92}

Email Content:
"${emailContent}"
`;

    const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo', // Use the correct chat model
        messages: [
            { role: 'system', content: 'You are a helpful assistant for classifying commercial loan-related emails.' },
            { role: 'user', content: prompt }
        ],
        max_tokens: 150,
        temperature: 0.3
    });

    return JSON.parse(response.choices[0].message.content.trim());
}

async function detectSpam(emailContent) {
    const prompt = `
Determine if the following email is spam or not spam in concise.

Email Content:
"${emailContent}"
`;

    const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
            { role: 'system', content: 'You are a helpful assistant for spam detectionn in commercial loan related emails.' },
            { role: 'user', content: prompt }
        ],
        max_tokens: 10,
        temperature: 0.3
    });

    return response.choices[0].message.content.trim();
}
async function extractEntities(emailContent) {
    const prompt = `
Extract the entities from the email content like below and there can be many more:
- Customer Name
- Loan Amount
- Account Number

Provide the response in JSON format like below and add more if found:
{
    "customerName": "John Doe",
    "loanAmount": "$50,000",
    "accountNumber": "123456789"
}

Email Content:
"${emailContent}"
`;

    const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
            { role: 'system', content: 'You are a helpful assistant for extracting entities from commercial loan related emails' },
            { role: 'user', content: prompt }
        ],
        max_tokens: 150,
        temperature: 0.3
    });
    return JSON.parse(response.choices[0].message.content.trim());
}

async function classifyIntent(emailContent) {
    const prompt = `
Identify the intent of the following email. Possible intents include like below and there can be more:
- Loan Application
- Query
- Complaint
- Feedback
- Other

Email Content:
"${emailContent}"
`;

    const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
            { role: 'system', content: 'You are a helpful assistant for intent classification in commercial loan releated emails.' },
            { role: 'user', content: prompt }
        ],
        max_tokens: 50,
        temperature: 0.3
    });

    return response.choices[0].message.content.trim();
}

async function analyzeSentiment(emailContent) {
    const prompt = `
Analyze the sentiment of the following email content. Classify it as Positive, Negative, or Neutral.

Email Content:
"${emailContent}"
`;

    const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
            { role: 'system', content: 'You are a helpful assistant for sentiment analysis.' },
            { role: 'user', content: prompt }
        ],
        max_tokens: 50,
        temperature: 0.3
    });

    return response.choices[0].message.content.trim();
}


// Process emails and return classification
app.get('/process-emails', async (req, res) => {
    try {
        const emailFiles = getEmailFiles();
        const results = [];

        for (let file of emailFiles) {
            const filePath = path.join(EMAIL_FOLDER, file);
            let email = file.endsWith('.eml') ? await parseEml(filePath) : parseMsg(filePath);

            let emailText = email.body;
            for (let attachment of email.attachments) {
                emailText += "\n" + (await extractAttachmentText(attachment));
            }

            const classification = await classifyRequest(emailText);
            const sentiment = await analyzeSentiment(emailText);
            const intent = await classifyIntent(emailText);
            const entities = await extractEntities(emailText);
            const spamStatus = await detectSpam(emailText);
            results.push({
                subject: email.subject,
                ...classification,
                sentiment,
                intent,
                entities,
                spamStatus,
            });

        }
        res.json(results);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to process emails" });
    }
});

app.listen(5000, () => console.log("Server running on port 5000"));

