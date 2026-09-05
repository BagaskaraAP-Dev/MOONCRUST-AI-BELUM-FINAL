import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import chatHandler from './api/chat.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/app.js', express.static(path.join(__dirname, 'app.js')));

// Map /api/chat route to Vercel serverless handler function
app.all('/api/chat', (req, res) => {
  return chatHandler(req, res);
});

app.listen(PORT, () => {
  console.log(`================================================`);
  console.log(` 🌙 Mooncrust AI Chatbot Running Locally`);
  console.log(` 🌐 URL : http://localhost:${PORT}`);
  console.log(`================================================`);
});
