const express = require('express');
const cors = require('cors');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const VECTOR_PATH = path.join(__dirname, 'vectorStore.json');

// Helper: Load vector store
function loadVectorStore() {
  return JSON.parse(fs.readFileSync(VECTOR_PATH, 'utf8'));
}

// Helper: Get embedding for a query
async function getEmbedding(text) {
  const res = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: text,
  });
  const embedding = res.data[0].embedding;
  return embedding;
}

// Helper: Cosine similarity
function cosineSimilarity(a, b) {
  let dot = 0.0, normA = 0.0, normB = 0.0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Helper: Retrieve top-k docs
function retrieveDocs(queryEmbedding, k = 1) {
  const docs = loadVectorStore();
  docs.forEach(doc => {
    doc.sim = cosineSimilarity(queryEmbedding, doc.embedding);
  });
  return docs.sort((a, b) => b.sim - a.sim).slice(0, k);
}

// Helper: Format context for LLM (dynamically fit as much as possible)
function formatContext(docs, maxDocLength = 2000, maxTotalLength = 12000) {
  let totalLength = 0;
  let context = [];
  for (let i = 0; i < docs.length; i++) {
    let text = docs[i].text.slice(0, maxDocLength);
    if (totalLength + text.length > maxTotalLength) break;
    context.push(`[${i+1}] ${text}`);
    totalLength += text.length;
  }
  return context.join('\n');
}

// Helper: Format citations
function formatCitations(docs) {
  return docs.map((doc, i) => `[${i+1}] ${doc.title}`).join(' ');
}

// Helper: Get dynamic section list for a topic using LLM
async function getSectionsForTopic(topic) {
  const prompt = `You are a Wikipedia editor. For a comprehensive article about "${topic}", list the most important and relevant sections that should be included. Return ONLY a JSON array of section titles, with no additional text or explanation. Example format: ["Introduction", "History", "Development", "Applications", "Impact", "See Also", "References"]`;
  const resp = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 256,
    temperature: 0.2,
  });
  const text = resp.choices[0].message.content.trim();
  try {
    // Try to parse the entire response as JSON first
    const sections = JSON.parse(text);
    if (Array.isArray(sections) && sections.length > 0) {
      return sections;
    }
    // If that fails, try to find and parse a JSON array in the text
    const match = text.match(/\[.*\]/s);
    if (match) {
      const sections = JSON.parse(match[0]);
      if (Array.isArray(sections) && sections.length > 0) {
        return sections;
      }
    }
    // If all parsing attempts fail, return a default set of sections
    return ["Introduction", "History", "Development", "Applications", "Impact", "See Also", "References"];
  } catch (err) {
    console.error('Error parsing sections:', err);
    return ["Introduction", "History", "Development", "Applications", "Impact", "See Also", "References"];
  }
}

// Speculative RAG pipeline for a single section
async function speculativeRAGSection(topic, section) {
  // 1. Get embedding for section prompt
  const sectionPrompt = `${section} of ${topic}`;
  const queryEmbedding = await getEmbedding(sectionPrompt);

  // 2. Retrieve docs for fast model
  const fastDocs = retrieveDocs(queryEmbedding, 3);

  // 3. Fast model draft
  const fastContext = formatContext(fastDocs, 1200, 6000);
  const fastPrompt = `Write the "${section}" section of a comprehensive Wikipedia article about "${topic}". Be as exhaustive, detailed, and thorough as possible, covering all relevant subtopics, examples, and background. Use only the information below. Cite sources as [1], [2], etc.\n\nSources:\n${fastContext}`;
  const resp = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: fastPrompt }],
    max_tokens: 4096,
    temperature: 0.2,
  });
  const draftArticle = resp.choices[0].message.content;

  // 4. Get embedding for draft article
  const draftEmbedding = await getEmbedding(draftArticle);

  // 5. Retrieve docs for accurate model using draft embedding
  const accurateDocs = retrieveDocs(draftEmbedding, 3);

  // 6. Accurate model refinement (minimal prompt, only draft article)
  const accuratePrompt = `Refine and expand the following draft for the "${section}" section of a Wikipedia article about "${topic}". Make the section as long, detailed, and comprehensive as possible, up to the maximum length allowed. Add more subtopics, examples, and background where possible. Ensure all claims are supported and cite sources as [1], [2], etc.\n\nDraft Section:\n${draftArticle}`;
  const accurateResp = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: accuratePrompt }],
    max_tokens: 4096,
    temperature: 0.2,
  });
  const finalSection = accurateResp.choices[0].message.content;
  return { section, content: finalSection };
}

// Main pipeline: generate full article by sections
async function speculativeRAG(topic) {
  // 1. Get section list
  const sections = await getSectionsForTopic(topic);
  let articleSections = [];
  for (const section of sections) {
    try {
      const result = await speculativeRAGSection(topic, section);
      articleSections.push(result);
    } catch (err) {
      articleSections.push({ section, content: `Error generating section: ${err.message}` });
    }
  }
  // 2. Combine sections
  let article = articleSections.map(s => `## ${s.section}\n\n${s.content}`).join('\n\n');
  return article;
}

app.post('/api/generate-article', async (req, res) => {
  try {
    const { topic } = req.body;
    if (!topic) return res.status(400).json({ error: 'Missing topic' });
    const article = await speculativeRAG(topic);
    res.json({ article });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate article' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 