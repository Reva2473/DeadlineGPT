# DeadlineGPT 🚀

An AI-powered project manager built for hackathons that cuts through the noise. DeadlineGPT automatically analyzes your urgent emails, syncs with your Google Calendar, and uses **Gemini 2.5 Flash** to generate a clear, prioritized action plan for your day.

**Live Demo:** [https://deadline-gpt-273226981062.us-central1.run.app](https://deadline-gpt-273226981062.us-central1.run.app)

*(Note: Since this app requires read-access to your Calendar and Gmail to generate insights, you might see a "Google hasn't verified this app" warning. Click **Advanced -> Go to deadline-gpt (unsafe)** to bypass it and see the magic!)*

---

## 🌟 Features

- **Automated Triage:** Instantly pulls your unread/urgent emails and upcoming calendar events.
- **AI Action Plan:** Uses Gemini 2.5 Flash to synthesize your data and tell you exactly what you need to focus on right now.
- **Smart Nudges:** Identifies tasks you're falling behind on and suggests immediate actions.
- **One-Click Drafting:** Drafts replies to urgent emails or outlines for documents directly from your dashboard.
- **Beautiful UI:** A sleek, dark-mode focused, glassmorphism dashboard that makes productivity feel premium.

## 🛠️ Tech Stack

- **Frontend:** React + Vite (Vanilla CSS for custom glassmorphism UI)
- **Backend:** Node.js + Express
- **Authentication:** Google OAuth 2.0 (Passport.js structure)
- **AI Integration:** Google Gen AI SDK (Gemini 2.5 Flash model)
- **Deployment:** Docker + Google Cloud Run + Google Cloud Build

## 🚀 Running Locally

Want to run DeadlineGPT on your own machine?

### 1. Prerequisites
- Node.js v20+
- A Google Cloud Project with the following APIs enabled:
  - Gmail API
  - Google Calendar API
  - Generative Language API (Gemini)
- Google OAuth 2.0 Credentials (Client ID & Secret)

### 2. Environment Setup
Create a `.env` file in the `backend/` directory with the following variables:
```env
GEMINI_API_KEY=your_gemini_api_key
GOOGLE_CLIENT_ID=your_oauth_client_id
GOOGLE_CLIENT_SECRET=your_oauth_client_secret
SESSION_SECRET=a_random_secure_string
PORT=8080
FRONTEND_URL=http://localhost:5173
REDIRECT_URI=http://localhost:8080/auth/google/callback
```

### 3. Installation & Run
Start the backend server:
```bash
cd backend
npm install
npm start
```

Start the frontend development server:
```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173` in your browser!

---

*Built with ❤️ during a weekend hackathon.*
