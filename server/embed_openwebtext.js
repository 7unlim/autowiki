const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function embedText(text) {
  const res = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: text,
  });
  return res.data[0].embedding;
}

async function main() {
  const inputPath = path.join(__dirname, 'openwebtext_sample.txt');
  const outputPath = path.join(__dirname, 'vectorStore.json');
  const lines = fs.readFileSync(inputPath, 'utf-8').split('\n').filter(Boolean);

  const vectorStore = [];
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].trim();
    if (!text) continue;
    console.log(`Embedding ${i + 1}/${lines.length}`);
    try {
      const embedding = await embedText(text);
      vectorStore.push({
        id: `owt_${i + 1}`,
        title: 'OpenWebText',
        text,
        embedding,
      });
    } catch (err) {
      console.error(`Failed to embed line ${i + 1}:`, err.message);
    }
    // Optional: limit to first N for testing
    // if (vectorStore.length >= 100) break;
  }

  fs.writeFileSync(outputPath, JSON.stringify(vectorStore, null, 2));
  console.log(`Saved ${vectorStore.length} entries to ${outputPath}`);
}

main(); 