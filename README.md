<p align="center">
  <img src="logo.svg" alt="Lion AI Logo" width="100%"/>
</p>

# 🦁 Lion AI – Intelligent AI Assistant

**Lion AI** is a feature-rich Progressive Web App (PWA) AI assistant with **RAG** (personal documents), **image vision**, **voice input (STT)**, **web search**, and **long-term memory** with conversation summarization.

![PWA](https://img.shields.io/badge/PWA-Enabled-5A0FC8)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## ✨ Features

| Category | Features |
|----------|----------|
| 💬 Chat | Real-time streaming, automatic conversation summarization (long-term memory), response caching |
| 🌐 Web search | DuckDuckGo integration (manual or automatic fallback) |
| 📄 RAG (Documents) | Upload `.txt`, `.md`, `.csv`, `.pdf` → vector search + keyword + full fallback |
| 🖼️ Vision | Image analysis (upload to Supabase Storage) |
| 🎤 Voice (STT) | Speech-to-text with automatic language detection |
| 📱 PWA | Installable on mobile/desktop, offline support (static assets) |
| 🔐 Auth | Supabase Auth (email + Google OAuth) |
| 📊 Analytics | Request logging (duration, tokens, success/error) |

---

## 🏗️ Tech Stack

- **Frontend**: HTML5, CSS3, Vanilla JS (ES6)
- **Backend / LLM**: Cloudflare Worker (custom endpoints)
- **Database & Auth**: Supabase (Postgres + vector storage)
- **Embeddings**: via Worker (text → vector)
- **PWA**: Service worker + manifest.json
- **Speech Recognition**: Web Speech API

---

## 🚀 Quick Start

```bash
git clone https://github.com/DragoneI/lion-ai.git
cd lion-ai
```

Then serve locally:

```bash
python -m http.server 8000
# or
npx serve .
```

Open http://localhost:8000

---

🔧 Configuration

Create a Supabase project and a Cloudflare Worker.
Then update these variables in script.js:

```javascript
const SUPABASE_URL = "https://your-project.supabase.co";
const SUPABASE_ANON_KEY = "your-anon-key";
const WORKER_URL = "https://your-worker.workers.dev/";
```

Make sure your Worker supports these endpoints:

Endpoint Method Description
/ POST LLM chat (streaming optional)
/search POST Web search (DuckDuckGo)
/embed POST Generate embeddings
/analyze-image POST Multimodal image analysis

---

📱 Usage

📄 Add a document (RAG)

Click the 📄 button → select a file → ask questions → the AI will prioritize your document.

🖼️ Analyze an image

Click the 🖼️ button → select an image → (optional) add a question → send.

🎤 Voice input

Click the 🎤 button → speak → text appears and sends automatically.

🌐 Force web search

Click 🌐 before sending → the AI will search the web even if cached.

---

📁 Project Structure

```
lion-ai/
├── index.html          # Main chat interface
├── login.html          # Authentication page
├── style.css           # Full styles + animations
├── script.js           # Core logic (RAG, STT, vision, streaming)
├── sw.js               # Service Worker (PWA)
├── manifest.json       # PWA metadata
├── logo.svg            # App icon
└── README.md           # This file
```

---

🧪 Roadmap (Ideas)

· Reranking (Cohere / BGE-reranker)
· Full offline mode with IndexedDB
· Export conversations (JSON / PDF)
· Dark / light theme toggle
· Additional LLM providers (Claude, Gemini, local)

---

🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first.

1. Fork the project
2. Create your branch (git checkout -b feature/amazing-feature)
3. Commit (git commit -m 'Add amazing feature')
4. Push (git push origin feature/amazing-feature)
5. Open a Pull Request

---

📜 License

Distributed under the MIT License.

---

🔗 Links

· GitHub: @DragoneI
· Project repository: https://github.com/DragoneI/lion-ai

---

⭐ Star this repo if you find it useful!

```

---
