const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const multer = require('multer');

const { google } = require('googleapis');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const port = process.env.PORT || 8080;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// 1. SECURITY HEADERS
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "https://generativelanguage.googleapis.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
}));

// 2. CORS RESTRICTIONS
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true, // Allow cookies
}));
app.use(express.json({ limit: '1mb' })); // Limit JSON body size

// 3. RATE LIMITING
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// 4. SECURE SESSION MANAGEMENT
app.use(session({
  store: new FileStore({ 
    path: path.join(__dirname, 'sessions'),
    secret: process.env.SESSION_SECRET || 'fallback_insecure_secret'
  }),
  secret: process.env.SESSION_SECRET || 'fallback_insecure_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// 5. SECURE UPLOADS (Multer validation)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, and WEBP are allowed.'));
    }
  }
});

// Initialize Gemini SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Google OAuth2 Client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI || `http://localhost:${port}/auth/google/callback`
);

// Global store for the background worker (In a real app, this MUST be a database)
const globalTasksStore = {};
const globalNudgesStore = {};

// In-memory cache to save API tokens
const apiCache = new Map();
const MAX_CACHE_SIZE = 100;
const setCache = (key, value) => {
  if (apiCache.size >= MAX_CACHE_SIZE) {
    const firstKey = apiCache.keys().next().value;
    apiCache.delete(firstKey);
  }
  apiCache.set(key, value);
};
const getCacheKey = (body) => require('crypto').createHash('md5').update(JSON.stringify(body)).digest('hex');

// --- ENDPOINTS ---

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/auth/google', (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.profile',
  ];
  const url = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: scopes, prompt: 'consent select_account' });
  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    req.session.tokens = tokens; // Store securely in session
    res.redirect(`${FRONTEND_URL}/dashboard`);
  } catch (error) {
    console.error('Error fetching OAuth tokens', error);
    res.status(500).send('Authentication failed');
  }
});

// Helper to set OAuth credentials per request
const getAuthenticatedClient = (req) => {
  if (!req.session.tokens) return null;
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  client.setCredentials(req.session.tokens);
  
  // Save refreshed tokens back to the session automatically
  client.on('tokens', (tokens) => {
    if (tokens.refresh_token) {
      req.session.tokens = { ...req.session.tokens, ...tokens };
    } else {
      req.session.tokens.access_token = tokens.access_token;
      req.session.tokens.expiry_date = tokens.expiry_date;
    }
    req.session.save();
  });
  
  return client;
};

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Could not log out' });
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

app.get('/api/user', async (req, res) => {
  const client = getAuthenticatedClient(req);
  if (!client) return res.status(401).json({ error: 'Not authenticated with Google' });
  const gmail = google.gmail({ version: 'v1', auth: client });
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  try {
    const profile = await gmail.users.getProfile({ userId: 'me' });
    let name = '';
    try {
      const userInfo = await oauth2.userinfo.get();
      name = userInfo.data.name;
    } catch (e) {
      console.error('Could not fetch userinfo, missing scope?', e.message);
    }
    res.json({ 
      email: profile.data.emailAddress, 
      name: name 
    });
  } catch (error) {
    console.error('Error fetching user profile', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

app.get('/api/emails', async (req, res) => {
  const client = getAuthenticatedClient(req);
  if (!client) return res.status(401).json({ error: 'Not authenticated with Google' });
  
  const gmail = google.gmail({ version: 'v1', auth: client });
  try {
    const response = await gmail.users.messages.list({ userId: 'me', q: 'is:unread', maxResults: 20 });
    const messages = response.data.messages || [];
    const emailDetails = await Promise.all(messages.map(async (msg) => {
      const email = await gmail.users.messages.get({
        userId: 'me', id: msg.id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date']
      });
      const headers = email.data.payload.headers;
      return {
        threadId: email.data.threadId,
        id: email.data.id,
        snippet: email.data.snippet,
        sender: headers.find(h => h.name === 'From')?.value,
        subject: headers.find(h => h.name === 'Subject')?.value,
        date: headers.find(h => h.name === 'Date')?.value,
      };
    }));
    res.json({ emails: emailDetails });
  } catch (error) {
    console.error('Error fetching emails', error);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

app.get('/api/calendar', async (req, res) => {
  const client = getAuthenticatedClient(req);
  if (!client) return res.status(401).json({ error: 'Not authenticated with Google' });
  
  const calendar = google.calendar({ version: 'v3', auth: client });
  try {
    const timeMin = new Date().toISOString();
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + 7);
    
    const response = await calendar.events.list({
      calendarId: 'primary', timeMin, timeMax: timeMax.toISOString(), maxResults: 50, singleEvents: true, orderBy: 'startTime'
    });
    
    const items = response.data.items || [];
    const events = items.map(event => ({
      id: event.id,
      title: event.summary,
      date: event.start.date || event.start.dateTime,
      time: event.start.dateTime || null,
      location: event.location,
      description: event.description,
    }));
    res.json({ events });
  } catch (error) {
    console.error('Error fetching calendar', error);
    res.status(500).json({ error: 'Failed to fetch calendar events' });
  }
});

app.post('/api/manual-screenshot', (req, res, next) => {
  req.session.isAnonymous = true; // Mark session as active
  req.session.save();
  upload.array('screenshots')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No valid screenshots uploaded' });

  const prompt = `Analyze this screenshot carefully. Extract ALL tasks, deadlines, commitments, meetings, assignments, or action items visible.
  Return ONLY a JSON object matching this schema:
  {
    "tasks": [
      {
        "title": "string",
        "deadline": "string",
        "priority": 9, // integer 1-10
        "effortHours": 4, // integer representing estimated hours to complete
        "source": "Screenshot",
        "actionNeeded": "string description of what action is required"
      }
    ],
    "events": [
      {
        "title": "string",
        "date": "string",
        "time": "string",
        "description": "string"
      }
    ],
    "emailsNeedingReply": [
      {
        "from": "string",
        "subject": "string",
        "summary": "string",
        "urgency": 8 // integer 1-10
      }
    ],
    "confidence": 8, // integer 1-10, how confident you are in the extraction
    "notes": "anything ambiguous or unclear in the screenshot"
  }`;
  try {
    const contents = [
      ...req.files.map(file => ({ inlineData: { data: file.buffer.toString('base64'), mimeType: file.mimetype } })),
      prompt
    ];
    const response = await ai.models.generateContent({ model: 'gemma-4-31b-it', contents, config: { responseMimeType: 'application/json' } });
    res.json(JSON.parse(response.text));
  } catch (error) {
    res.status(500).json({ error: 'Failed to analyze screenshots' });
  }
});

app.post('/api/manual-text', async (req, res) => {
  req.session.isAnonymous = true;
  req.session.save();
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'No text provided' });
  
  if (text.length > 100000) return res.status(400).json({ error: 'Text too large' });

  const prompt = `Extract all tasks, deadlines, calendar events, and emails needing replies from this text. The text may be messy, copied from emails, pasted from a calendar, or just a brain dump. Be thorough.
  Return ONLY a JSON object with:
  {
    "tasks": [{ "title": "string", "deadline": "string", "priority": 5, "source": "Manual Text", "actionNeeded": "string", "effortHours": 2 }],
    "events": [{ "title": "string", "date": "string", "time": "string", "description": "string" }],
    "emailsNeedingReply": [{ "from": "string", "subject": "string", "summary": "string", "urgency": 5 }]
  }`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemma-4-31b-it',
      contents: `${prompt}\n\nTEXT:\n${text}`,
      config: { responseMimeType: 'application/json' }
    });
    res.json(JSON.parse(response.text));
  } catch (error) {
    res.status(500).json({ error: 'Failed to analyze text' });
  }
});

app.post('/api/analyze', async (req, res) => {
  if (!req.session.tokens && !req.session.isAnonymous) return res.status(401).json({ error: 'Unauthorized: Session required' });
  const { emails, events, manualData } = req.body;
  // Basic length validation to prevent prompt injection payload size
  if (JSON.stringify(req.body).length > 500000) return res.status(400).json({ error: 'Payload too large' });

  const cacheKey = 'analyze_' + getCacheKey(req.body);
  if (apiCache.has(cacheKey)) {
    const cached = apiCache.get(cacheKey);
    if (cached.tasks && cached.tasks.length > 0) {
      globalTasksStore[req.session.id] = [...cached.tasks];
    }
    return res.json(cached);
  }

  const systemPrompt = `You are an autonomous AI life manager. Analyze these emails, events, and manual context. Return ONLY a valid JSON object with no comments or markdown formatting. Follow these rules for the properties:
  - overallStressLevel: integer from 1-10
  - urgency: integer from 1-10
  - priority: integer from 1-10 (evaluate realistically based on urgency/impact, don't default to 9)
  - effortHours: integer
  - deadline: string (e.g. 'June 28' or null if none)
  
  Use exactly this JSON schema:
  {
    "overallStressLevel": 5,
    "conflicts": ["string description of scheduling conflicts"],
    "emailsNeedingReply": [
      {
        "id": "string",
        "threadId": "string",
        "sender": "string",
        "subject": "string",
        "snippet": "string",
        "summary": "string",
        "urgency": 8,
        "deadline": "string",
        "source": "Gmail"
      }
    ],
    "tasks": [
      {
        "id": 101,
        "title": "string",
        "deadline": "string",
        "priority": 5,
        "effortHours": 4,
        "source": "Gmail/Calendar/Manual",
        "actionNeeded": "string description of what action is required"
      }
    ]
  }`;
  try {
    const response = await Promise.race([
      ai.models.generateContent({
        model: 'gemma-4-31b-it',
        contents: `${systemPrompt}\n\nDATA:\nEmails: ${JSON.stringify(emails)}\nEvents: ${JSON.stringify(events)}\nManual: ${JSON.stringify(manualData)}`,
        config: { responseMimeType: 'application/json' }
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('AI Request Timeout')), 90000))
    ]);
    let rawText = response.text || '';
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedResult = JSON.parse(rawText);
    
    if (parsedResult.tasks && parsedResult.tasks.length > 0) {
      globalTasksStore[req.session.id] = [...parsedResult.tasks];
    }
    
    setCache(cacheKey, parsedResult);
    res.json(parsedResult);
  } catch (error) {
    console.warn('API Analyze Error (Likely Rate Limit). Falling back to mock data.', error.message);
    
    // MOCK FALLBACK DATA
    const mockResult = {
      overallStressLevel: 7,
      conflicts: ["Mock conflict: Meeting overlaps with lunch"],
      emailsNeedingReply: (emails || []).slice(0, 5).map(e => ({
        id: e.id,
        threadId: e.threadId || '',
        sender: e.sender || 'Unknown',
        subject: e.subject || 'Mock Subject',
        snippet: e.snippet || '',
        summary: "Mock AI Summary: This is an automatically generated summary because your Google API rate limit was exceeded.",
        urgency: Math.floor(Math.random() * 10) + 1,
        deadline: "Tomorrow, 5:00 PM",
        source: "Gmail"
      })),
      tasks: [
        {
          id: Date.now(),
          title: "Follow up on mock emails",
          deadline: "End of Day",
          priority: 8,
          effortHours: 1,
          source: "Gmail",
          actionNeeded: "Review the mock emails and reply."
        }
      ]
    };

    if (mockResult.tasks && mockResult.tasks.length > 0) {
      // Don't pollute task list with mock tasks on rate limits
      mockResult.tasks = [];
    }
    
    res.json(mockResult);
  }
});

app.post('/api/action-plan', async (req, res) => {
  if (!req.session.tokens && !req.session.isAnonymous) return res.status(401).json({ error: 'Unauthorized: Session required' });
  const { tasks, events } = req.body;
  
  const cacheKey = 'plan_' + getCacheKey(req.body);
  if (apiCache.has(cacheKey)) {
    return res.json(apiCache.get(cacheKey));
  }
  
  if (!tasks?.length && !events?.length) {
    const emptyPlan = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return {
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        dayName: days[d.getDay()],
        motivationalMessage: "A clear schedule! Take a break or add some tasks.",
        calendarEvents: [],
        morningFocus: null,
        afternoonBlock: null,
        eveningWrapUp: null,
        isEmpty: true
      };
    });
    return res.json(emptyPlan);
  }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const systemPrompt = `You are an AI scheduler. Today is ${today}. Given these tasks and deadlines, build a realistic day-by-day action plan for 7 days starting from today. Return ONLY a JSON array of 7 objects.
  IMPORTANT: Do NOT hallucinate or make up filler tasks (like "Strategic Planning" or "Inbox Zero") if the user has no tasks or deadlines assigned for that day. If a day is completely free, set morningFocus, afternoonBlock, and eveningWrapUp to null.
  
  Each object MUST follow exactly this schema (and be valid JSON without comments):
  {
    "date": "string (e.g. June 29)",
    "dayName": "string (e.g. Monday)",
    "motivationalMessage": "string",
    "calendarEvents": ["string of event titles that conflict or occur on this day"],
    "morningFocus": {
      "task": "string",
      "goal": "string",
      "specificActions": ["string", "string"]
    },
    "afternoonBlock": {
      "task": "string",
      "goal": "string",
      "specificActions": ["string", "string"]
    },
    "eveningWrapUp": {
      "task": "string",
      "goal": "string",
      "specificActions": ["string", "string"]
    }
  }
  NOTE: For any day where there are no tasks or events, return null for morningFocus, afternoonBlock, and eveningWrapUp instead of an object.`;
  try {
    const response = await Promise.race([
      ai.models.generateContent({
        model: 'gemma-4-31b-it',
        contents: `${systemPrompt}\n\nTasks: ${JSON.stringify(tasks)}\nCalendar: ${JSON.stringify(events)}`,
        config: { responseMimeType: 'application/json' }
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('AI Request Timeout')), 90000))
    ]);
    const parsedResult = JSON.parse(response.text);
    setCache(cacheKey, parsedResult);
    res.json(parsedResult);
  } catch (error) {
    console.warn('API Action Plan Error (Likely Rate Limit). Returning empty plan.', error.message);
    
    const emptyPlan = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return {
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        dayName: days[d.getDay()],
        motivationalMessage: "A clear schedule! Take a break or add some tasks.",
        calendarEvents: [],
        morningFocus: null,
        afternoonBlock: null,
        eveningWrapUp: null,
        isEmpty: true
      };
    });
    
    res.json(emptyPlan);
  }
});

app.post('/api/draft-email', async (req, res) => {
  if (!req.session.tokens && !req.session.isAnonymous) return res.status(401).json({ error: 'Unauthorized: Session required' });
  const { threadId, context } = req.body;
  const systemPrompt = `You are a professional email writer. Draft a reply to this email thread. Return ONLY a JSON object with subject, body, tone, estimatedReadTime.`;
  try {
    const response = await ai.models.generateContent({
      model: 'gemma-4-31b-it',
      contents: `${systemPrompt}\n\nContext: ${context || 'Thread ID: ' + threadId}`,
      config: { responseMimeType: 'application/json' }
    });
    res.json(JSON.parse(response.text));
  } catch (error) {
    res.status(500).json({ error: 'Failed to draft email' });
  }
});

app.post('/api/send-email', async (req, res) => {
  const { threadId, subject, body, to } = req.body;
  const client = getAuthenticatedClient(req);
  if (!client) return res.status(401).json({ error: 'Not connected to Gmail' });

  const gmail = google.gmail({ version: 'v1', auth: client });
  try {
    const rawContent = [`To: ${to || 'me'}`, `Subject: ${subject}`, `In-Reply-To: ${threadId}`, `References: ${threadId}`, `Content-Type: text/plain; charset=utf-8`, '', body].join('\n');
    const base64SafeContent = Buffer.from(rawContent).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw: base64SafeContent, threadId } });
    
    // Automatically mark the thread as read after replying
    try {
      await gmail.users.threads.modify({
        userId: 'me',
        id: threadId,
        requestBody: { removeLabelIds: ['UNREAD'] }
      });
    } catch (markError) {
      console.warn('Failed to mark thread as read:', markError.message);
    }
    
    res.json({ success: true, message: 'Email sent successfully via Gmail API' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send email via API' });
  }
});

app.get('/api/nudges', (req, res) => res.json({ nudges: globalNudgesStore[req.session.id] || [] }));

app.post('/api/draft-document', async (req, res) => {
  if (!req.session.tokens && !req.session.isAnonymous) return res.status(401).json({ error: 'Unauthorized: Session required' });
  const { taskContext } = req.body;
  const systemPrompt = `You are a professional technical writer. Draft a markdown formatted document.`;
  try {
    const response = await ai.models.generateContent({ model: 'gemma-4-31b-it', contents: `${systemPrompt}\n\nTask: ${JSON.stringify(taskContext)}` });
    res.json({ document: response.text });
  } catch (error) {
    console.warn('API Draft Document Error. Falling back to mock data.', error.message);
    res.json({ document: `# Draft Document: ${taskContext.title || 'Untitled'}\n\nThis is a mock drafted document because the AI API rate limit was exceeded.\n\n## Overview\nWe need to accomplish the goals outlined in the task.\n\n## Next Steps\n- Step 1: Review this mock document\n- Step 2: Copy to clipboard if needed\n- Step 3: Wait for rate limit to reset for real AI drafting` });
  }
});

// Background Interval Nudge Generator (Run every 30 minutes)
setInterval(async () => {
  for (const sessionId of Object.keys(globalTasksStore)) {
    const tasks = globalTasksStore[sessionId];
    if (!tasks || tasks.length === 0) continue;
    const task = tasks[Math.floor(Math.random() * tasks.length)];
    const hoursRemaining = Math.floor(Math.random() * 24) + 1;
    const systemPrompt = `Generate an escalating nudge for this task: [${task.title}]. Hours remaining: [${hoursRemaining}]. Return ONLY a JSON response: {"message": "", "tone": "warm/direct/urgent", "suggestedAction": ""}`;

    try {
      const response = await ai.models.generateContent({ model: 'gemma-4-31b-it', contents: systemPrompt, config: { responseMimeType: 'application/json' } });
      const parsedNudge = JSON.parse(response.text);
      if (!globalNudgesStore[sessionId]) globalNudgesStore[sessionId] = [];
      globalNudgesStore[sessionId].unshift({
        id: Date.now(), task: task.title, timeLeft: `${hoursRemaining} hours remaining`, message: parsedNudge.message, action: parsedNudge.suggestedAction, tone: parsedNudge.tone
      });
      if (globalNudgesStore[sessionId].length > 10) globalNudgesStore[sessionId].pop();
    } catch (error) {
      console.error('Failed to run background nudge cron for session ' + sessionId, error);
    }
  }
}, 30 * 60 * 1000);

// Serve static frontend build
app.use(express.static(path.join(__dirname, '../frontend/dist')));
app.get('*all', (req, res) => res.sendFile(path.join(__dirname, '../frontend/dist', 'index.html')));

app.listen(port, () => console.log(`Backend listening on port ${port}`));
