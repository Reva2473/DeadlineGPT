import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, Inbox, CheckSquare, ListTodo, Bell, PlusCircle, LogOut, 
  AlertTriangle, ChevronRight, Play, Check, FileText, Send, Copy, 
  Volume2, ShieldAlert, Clock, Mail, UploadCloud, X, Sun, Moon, RefreshCw, Loader2,
  TrendingUp, TrendingDown, Minus, Download, Search
} from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const [completedBlocks, setCompletedBlocks] = useState({});
  const [panicStepsCompleted, setPanicStepsCompleted] = useState({});
  const [hiddenEmails, setHiddenEmails] = useState(new Set());
  const [activeSection, setActiveSection] = useState('week');
  const [stressLevel, setStressLevel] = useState(6);
  const [isGmailConnected, setIsGmailConnected] = useState(false);
  const [contextThumbnails, setContextThumbnails] = useState([]);
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [commandSearch, setCommandSearch] = useState('');
  const [hasSeenDailyBrief, setHasSeenDailyBrief] = useState(() => sessionStorage.getItem('hasSeenBrief') === 'true');
  const [isDailyBriefOpen, setIsDailyBriefOpen] = useState(false);
  const [isManualConnected, setIsManualConnected] = useState(false);
  
  const [tasks, setTasks] = useState(() => {
    const saved = localStorage.getItem('persistentTasks');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map((t, i) => ({ ...t, id: t.id ? `${t.id}` : `task-${i}-${Date.now()}` }));
      } catch (e) {}
    }
    return [];
  });
  
  useEffect(() => {
    localStorage.setItem('persistentTasks', JSON.stringify(tasks));
  }, [tasks]);


  useEffect(() => {
    if (!hasSeenDailyBrief && tasks.length > 0) {
      setIsDailyBriefOpen(true);
      sessionStorage.setItem('hasSeenBrief', 'true');
      setHasSeenDailyBrief(true);
    }
  }, [tasks.length, hasSeenDailyBrief]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          files.push(items[i].getAsFile());
        }
      }
      if (files.length > 0) {
        setActiveSection('context');
        setContextThumbnails(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);
  
  const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
  const [newTaskParams, setNewTaskParams] = useState({ title: '', deadline: '', priority: 5, effortHours: 1 });
  const [taskFormError, setTaskFormError] = useState('');
  
  const [initialTaskCount, setInitialTaskCount] = useState(null);
  const [initialEmailCount, setInitialEmailCount] = useState(null);
  const [initialEventCount, setInitialEventCount] = useState(null);
  const [initialStressLevel, setInitialStressLevel] = useState(null);
  
  // Modals state
  const [draftingEmail, setDraftingEmail] = useState(null); // { threadId, subject, body, tone, readTime }
  const [draftingDocument, setDraftingDocument] = useState(null);
  const [editingTask, setEditingTask] = useState(null); // The task object being edited
  const [panicTask, setPanicTask] = useState(null); // Task object for panic mode
  const [pomodoroTask, setPomodoroTask] = useState(null); // Task for Pomodoro timer
  const [isPomodoroActive, setIsPomodoroActive] = useState(false);
  const [pomodoroSeconds, setPomodoroSeconds] = useState(25 * 60);

  const [isLoading, setIsLoading] = useState(false);
  const [isPlanGenerating, setIsPlanGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [emails, setEmails] = useState([]);

  const [events, setEvents] = useState([]);
  const [actionPlan, setActionPlan] = useState([]);
  const [nudges, setNudges] = useState([]);
  const [manualText, setManualText] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [emailPage, setEmailPage] = useState(1);
  const [toast, setToast] = useState({ message: '', visible: false });
  const showToast = (msg) => { 
    setToast({ message: msg, visible: true }); 
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 2700); 
  };
  const emailsPerPage = 5;

  const analyzeEmailBatch = async (emailsToAnalyze, currentEvents, manualData = {}) => {
    if (!emailsToAnalyze || emailsToAnalyze.length === 0) return [];
    
    let cachedAnalyses = {};
    try {
      const stored = localStorage.getItem('emailAnalyses');
      if (stored) cachedAnalyses = JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }

    // Only analyze emails that do not have a cached analysis yet
    const unanalyzed = emailsToAnalyze.filter(e => !cachedAnalyses[e.id]);
    
    let newlyAnalyzedTasks = [];

    if (unanalyzed.length > 0) {
      try {
        const analysisRes = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ emails: unanalyzed, events: currentEvents, manualData })
        });
        if (analysisRes.ok) {
          const analysis = await analysisRes.json();
          
          if (analysis.emailsNeedingReply) {
            analysis.emailsNeedingReply.forEach(reply => {
              cachedAnalyses[reply.id] = {
                summary: reply.summary,
                urgency: reply.urgency,
                deadline: reply.deadline
              };
            });
          }
          
          // For any email that was sent but omitted by the AI (because it doesn't need a reply),
          // set a default summary so it doesn't get stuck on "Analyzing..."
          unanalyzed.forEach(e => {
            if (!cachedAnalyses[e.id]) {
              cachedAnalyses[e.id] = {
                summary: "No immediate action required.",
                urgency: 1,
                deadline: null
              };
            }
          });
          
          if (analysis.tasks) {
            newlyAnalyzedTasks = analysis.tasks;
          }
          
          localStorage.setItem('emailAnalyses', JSON.stringify(cachedAnalyses));
          
          if (analysis.overallStressLevel !== undefined) {
            setStressLevel(analysis.overallStressLevel);
          }
        } else {
          // If API fails with non-200, mark them to avoid infinite loading
          unanalyzed.forEach(e => {
            if (!cachedAnalyses[e.id]) {
              cachedAnalyses[e.id] = { summary: "Analysis failed. Please try again later.", urgency: 0, deadline: null };
            }
          });
        }
      } catch (e) {
        console.error(e);
        unanalyzed.forEach(e => {
          if (!cachedAnalyses[e.id]) {
            cachedAnalyses[e.id] = { summary: "Network error during analysis.", urgency: 0, deadline: null };
          }
        });
      }
    }

    // Apply cached analyses to emails state
    setEmails(prev => prev.map(email => {
      const cache = cachedAnalyses[email.id];
      return cache ? { ...email, ...cache, source: 'Gmail' } : email;
    }));

    return newlyAnalyzedTasks;
  };

  const generatePlan = async (taskList, eventList) => {
    setIsPlanGenerating(true);
    try {
      const planRes = await fetch('/api/action-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tasks: taskList, events: eventList })
      });
      if (planRes.ok) {
        const planData = await planRes.json();
        setActionPlan(planData);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsPlanGenerating(false);
    }
  };

  const generatePlanTimeoutRef = useRef(null);
  const debouncedGeneratePlan = (taskList, eventList) => {
    if (generatePlanTimeoutRef.current) {
      clearTimeout(generatePlanTimeoutRef.current);
    }
    generatePlanTimeoutRef.current = setTimeout(() => {
      generatePlan(taskList, eventList);
    }, 1500);
  };

  const fetchDashboardData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const emailRes = await fetch('/api/emails', { credentials: 'include' });
      const calendarRes = await fetch('/api/calendar', { credentials: 'include' });
      const userRes = await fetch('/api/user', { credentials: 'include' });
      
      let fetchedEmails = [];
      let fetchedEvents = [];
      let manualData = { tasks: [], events: [], emailsNeedingReply: [] };
      
      try {
        const stored = localStorage.getItem('manualData');
        if (stored) manualData = JSON.parse(stored);
      } catch (e) { console.error('Failed to parse manualData', e); }
      
      if (emailRes.ok) {
        const data = await emailRes.json();
        fetchedEmails = data.emails || [];
      }
      if (calendarRes.ok) {
        const data = await calendarRes.json();
        fetchedEvents = data.events || [];
      }
      if (userRes.ok) {
        const data = await userRes.json();
        if (data.email) setUserEmail(data.email);
        if (data.name) setUserName(data.name);
      } else if (userRes.status === 401) {
        if (!manualData || (!manualData.tasks?.length && !manualData.emailsNeedingReply?.length)) {
          navigate('/');
          return;
        }
      }
      
      setIsGmailConnected(emailRes.ok);
      setIsManualConnected(manualData.tasks.length > 0 || manualData.events.length > 0);
      
      const combinedEmails = [
        ...fetchedEmails.map(e => ({ ...e, source: 'Gmail' })),
        ...(manualData.emailsNeedingReply || []).map((e, idx) => ({ ...e, id: `manual-email-${idx}`, source: 'Manual' }))
      ];
      
      const combinedEvents = [
        ...fetchedEvents,
        ...(manualData.events || []).map((e, idx) => ({ ...e, id: `manual-event-${idx}`, source: 'Manual' }))
      ];
      
      setEmails(combinedEmails);
      setEvents(combinedEvents);
      
      let currentTasks = [];
      try {
        const saved = localStorage.getItem('persistentTasks');
        if (saved) {
          const parsed = JSON.parse(saved);
          currentTasks = parsed.map((t, i) => ({ ...t, id: t.id ? `${t.id}` : `task-${i}-${Date.now()}` }));
        }
      } catch (e) {}

      const manualTasks = (manualData.tasks || []).map((t, i) => ({ ...t, id: `manual-task-${i}-${Date.now()}`, source: t.source || 'Manual' }));
      const tasksWithManual = [...currentTasks, ...manualTasks.filter(mt => !currentTasks.find(pt => pt.title === mt.title))];

      // Trigger analysis for ONLY the first page to save tokens
      const initialBatch = fetchedEmails.slice(0, emailsPerPage);
      const newAnalyzedTasks = await analyzeEmailBatch(initialBatch, combinedEvents, manualData);
        
      const allTasks = [...tasksWithManual, ...newAnalyzedTasks];
      const finalUniqueTasks = allTasks.filter((t, idx, self) => self.findIndex(x => x.title === t.title) === idx);
      
      setTasks(finalUniqueTasks);

      setInitialTaskCount(prev => prev !== null ? prev : finalUniqueTasks.filter(t => !t.isDone).length);
      setInitialEmailCount(prev => prev !== null ? prev : combinedEmails.filter(e => !hiddenEmails.has(e.id)).length);
      setInitialEventCount(prev => prev !== null ? prev : combinedEvents.length);
      setInitialStressLevel(prev => prev !== null ? prev : stressLevel);

      // Generate action plan after initial batch
      await generatePlan(finalUniqueTasks.filter(t => !t.isDone), combinedEvents);
    } catch (err) {
      console.error(err);
      setError('Failed to load dashboard data. Ensure backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Trigger analysis when page changes or when emails get filtered out
  useEffect(() => {
    if (emails.length > 0) {
      const currentBatch = emails.filter(email => !hiddenEmails.has(email.id) && email.summary !== "No immediate action required.").slice((emailPage - 1) * emailsPerPage, emailPage * emailsPerPage);
      const needsAnalysis = currentBatch.some(e => !e.summary || e.summary === "Analyzing email content...");
      if (needsAnalysis) {
        analyzeEmailBatch(currentBatch, events);
      }
    }
  }, [emailPage, emails, hiddenEmails, events]);

  // Poll nudges
  useEffect(() => {
    const fetchNudges = async () => {
      try {
        const userRes = await fetch('/api/user', { credentials: 'include' });
        if (userRes.ok) {
          const data = await userRes.json();
          if (data.email) setUserEmail(data.email);
          if (data.name) setUserName(data.name);
        }
        const res = await fetch('/api/nudges', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setNudges(data.nudges || []);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchNudges();
    const interval = setInterval(fetchNudges, 60000);
    return () => clearInterval(interval);
  }, []);

  // Pomodoro Timer Logic
  useEffect(() => {
    let interval = null;
    if (isPomodoroActive && pomodoroSeconds > 0) {
      interval = setInterval(() => {
        setPomodoroSeconds(prev => prev - 1);
      }, 1000);
    } else if (pomodoroSeconds === 0) {
      setIsPomodoroActive(false);
      showToast('Pomodoro session completed! Take a short rest.');
      setPomodoroSeconds(25 * 60);
    }
    return () => clearInterval(interval);
  }, [isPomodoroActive, pomodoroSeconds]);


  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins}:${remainder < 10 ? '0' : ''}${remainder}`;
  };

  const handleDraftReply = async (email) => {
    setDraftingEmail({ threadId: email.threadId, to: email.sender, subject: `Re: ${email.subject}`, body: 'Drafting response...', tone: 'Professional', readTime: '-' });
    try {
      const res = await fetch('/api/draft-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ threadId: email.threadId, context: email.snippet })
      });
      if (res.ok) {
        const data = await res.json();
        setDraftingEmail(prev => ({ ...prev, body: data.body, tone: data.tone, readTime: data.estimatedReadTime || '1 min read' }));
      }
    } catch (err) {
      console.error('Failed to draft email', err);
    }
  };

  const handleSendEmail = async () => {
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ threadId: draftingEmail.threadId, to: draftingEmail.to, subject: draftingEmail.subject, body: draftingEmail.body })
      });
      if (res.ok) {
        showToast('Reply sent successfully!');
        const emailToHide = emails.find(e => e.threadId === draftingEmail.threadId);
        if (emailToHide) {
          setHiddenEmails(prev => new Set([...prev, emailToHide.id]));
        }
        setDraftingEmail(null);
      } else {
        showToast('Failed to send email.');
      }
    } catch (err) {
      console.error(err);
    }
  };


  const handleDraftDocument = async (task) => {
    setDraftingDocument({ task, content: 'Drafting document...', isLoading: true });
    try {
      const res = await fetch('/api/draft-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ taskContext: task })
      });
      const data = await res.json();
      setDraftingDocument({ task, content: data.document, isLoading: false });
    } catch (e) {
      setDraftingDocument({ task, content: 'Failed to draft.', isLoading: false });
    }
  };

  const handleCopyDraft = () => {
    navigator.clipboard.writeText(draftingEmail.body);
    showToast('Draft copied to clipboard!');
  };

  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? 'Good morning' : currentHour < 18 ? 'Good afternoon' : 'Good evening';

  const getTaskTrendText = () => {
    const current = tasks.filter(t => !t.isDone).length;
    if (initialTaskCount === null) return 'Baseline established';
    const diff = current - initialTaskCount;
    if (diff > 0) return `${diff} more since load`;
    if (diff < 0) return `${Math.abs(diff)} fewer since load`;
    return 'Same as start of session';
  };

  const getEmailTrendText = () => {
    const current = emails.filter(e => !hiddenEmails.has(e.id)).length;
    if (initialEmailCount === null) return 'Baseline established';
    const diff = current - initialEmailCount;
    if (diff > 0) return `${diff} more since load`;
    if (diff < 0) return `${Math.abs(diff)} fewer since load`;
    return 'Same as start of session';
  };

  const getEventTrendText = () => {
    const current = events.length;
    if (initialEventCount === null) return 'Baseline established';
    const diff = current - initialEventCount;
    if (diff > 0) return `${diff} more since load`;
    if (diff < 0) return `${Math.abs(diff)} fewer since load`;
    return 'Same as start of session';
  };

  const getStressTrendText = () => {
    if (initialStressLevel === null) return 'Baseline established';
    const diff = stressLevel - initialStressLevel;
    if (diff > 0) return `Up by ${diff} points`;
    if (diff < 0) return `Down by ${Math.abs(diff)} points`;
    return 'Same as start of session';
  };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row relative">
      {/* Subtle background grid */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(#2B2B2B 1px, transparent 1px), linear-gradient(90deg, #2B2B2B 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
      
      {/* SIDEBAR */}
      <div className="w-full md:w-64 bg-highlight border-r border-border flex flex-col z-10 sticky top-0 md:h-screen shadow-sm">
        <div className="p-6 border-b border-border">
          <h1 className="text-3xl font-serif tracking-tight bg-gradient-to-br from-primary to-secondary text-transparent bg-clip-text">DeadlineGPT</h1>
        </div>
        
        <nav className="flex-grow px-4 flex flex-col gap-1.5 mt-6">
          <NavItem 
            icon={<Calendar className="w-4 h-4" />} 
            label="Week at a Glance" 
            active={activeSection === 'week'} 
            onClick={() => setActiveSection('week')} 
          />
          <NavItem 
            icon={<Inbox className="w-4 h-4" />} 
            label="Inbox" 
            badge={emails.filter(e => !hiddenEmails.has(e.id)).length}
            active={activeSection === 'inbox'} 
            onClick={() => setActiveSection('inbox')} 
          />
          <NavItem 
            icon={<CheckSquare className="w-4 h-4" />} 
            label="Action Plan" 
            active={activeSection === 'plan'} 
            onClick={() => setActiveSection('plan')} 
          />
          <NavItem 
            icon={<ListTodo className="w-4 h-4" />} 
            label="Tasks" 
            badge={tasks.filter(t => !t.isDone).length}
            active={activeSection === 'tasks'} 
            onClick={() => setActiveSection('tasks')} 
          />
          <NavItem 
            icon={<Bell className="w-4 h-4" />} 
            label="Nudges" 
            badge={nudges.length}
            active={activeSection === 'nudges'} 
            onClick={() => setActiveSection('nudges')} 
          />
          <NavItem 
            icon={<PlusCircle className="w-4 h-4" />} 
            label="Add Context" 
            active={activeSection === 'context'} 
            onClick={() => setActiveSection('context')} 
          />
        </nav>
        
        <div className="px-4 pb-4 sm:hidden flex flex-col gap-2 mt-auto">
          {isGmailConnected && (
            <span className="px-2.5 py-1 bg-secondary/10 text-secondary text-xs rounded-full border border-secondary/20 flex items-center gap-1 font-medium w-fit">
              <span className="w-1.5 h-1.5 bg-secondary rounded-full"></span> Gmail Connected
            </span>
          )}
          {isGmailConnected && (
            <span className="px-2.5 py-1 bg-primary/10 text-primary text-xs rounded-full border border-primary/20 flex items-center gap-1 font-medium w-fit">
              <span className="w-1.5 h-1.5 bg-primary rounded-full"></span> Calendar Connected
            </span>
          )}
          {contextThumbnails.length > 0 && (
            <span className="px-2.5 py-1 bg-highlight text-primary text-xs rounded-full border border-primary/20 font-medium w-fit">
              {contextThumbnails.length} Screens
            </span>
          )}
        </div>

        <div className="px-4 pt-4 pb-4 border-t border-border mt-auto sm:mt-0">
          {/* User Profile Card */}
          <div className="bg-accent/40 rounded-soft p-3">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-sm font-semibold shrink-0">
                {(userName || userEmail || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-text truncate">
                  {userName || (userEmail ? userEmail.split('@')[0].charAt(0).toUpperCase() + userEmail.split('@')[0].slice(1) : 'User')}
                </div>
                <div className="text-[10px] text-text/50 truncate mt-0.5">{userEmail || 'Connected'}</div>
              </div>
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-1.5 rounded-full hover:bg-border text-text/50 hover:text-text transition-colors shrink-0"
                title="Toggle Theme"
              >
                {isDarkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              </button>
            </div>
            <button
              onClick={async () => {
                try {
                  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
                } catch (e) { console.error(e); }
                localStorage.removeItem('manualData');
                localStorage.removeItem('persistentTasks');
                localStorage.removeItem('emailAnalyses');
                navigate('/');
              }}
              className="w-full flex items-center justify-center gap-2 text-text/60 hover:text-urgency border border-border hover:border-urgency/40 rounded-soft py-1.5 text-xs font-medium transition-all duration-200 hover:bg-urgency/5"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col z-10 max-h-screen overflow-y-auto">
        {/* HEADER */}
        <header className="bg-highlight/95 border-b border-border p-5 px-8 flex flex-col sm:flex-row justify-between items-center sticky top-0 z-20 gap-4 shadow-sm">
          <div>
            <h2 className="text-2xl font-serif text-text">
              {activeSection === 'week' && 'My Week at a Glance'}
              {activeSection === 'inbox' && 'Inbox Intelligence'}
              {activeSection === 'plan' && 'Your 7-Day Plan'}
              {activeSection === 'tasks' && 'Task Command Center'}
              {activeSection === 'nudges' && 'Nudge Center'}
              {activeSection === 'context' && 'Add More Context'}
            </h2>
          </div>
          
          <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
            {/* Completion Progress */}
            <div className="flex flex-col items-start sm:items-end gap-1">
              <span className="font-serif text-sm text-text/80 flex items-center gap-1.5">
                Completion
                <span className="font-semibold">{tasks.length > 0 ? Math.round((tasks.filter(t => t.isDone).length / tasks.length) * 100) : 0}%</span>
              </span>
              <div className="w-24 sm:w-32 h-2 bg-border rounded-full overflow-hidden">
                <div 
                  className="h-full bg-secondary transition-all duration-500" 
                  style={{ width: `${tasks.length > 0 ? (tasks.filter(t => t.isDone).length / tasks.length) * 100 : 0}%` }}
                ></div>
              </div>
            </div>
            
            <div className="hidden sm:block w-px h-8 bg-border"></div>

            {/* Stress Level */}
            <div className="flex flex-col gap-1 sm:items-end">
              <span className="font-serif text-sm text-text/80 flex items-center gap-1.5">
                Stress Level
                <span className="font-semibold">{stressLevel}/10</span>
              </span>
              <div className="w-24 sm:w-32 h-2 bg-border rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ${stressLevel > 7 ? 'bg-urgency' : stressLevel > 4 ? 'bg-[#d69e2e]' : 'bg-primary'}`} 
                  style={{ width: `${(stressLevel / 10) * 100}%` }}
                ></div>
              </div>
            </div>
            
            <div className="hidden sm:flex gap-2">
              {isGmailConnected && (
                <span className="px-2.5 py-1 bg-secondary/10 text-secondary text-xs rounded-full border border-secondary/20 flex items-center gap-1 font-medium">
                  <span className="w-1.5 h-1.5 bg-secondary rounded-full"></span> Gmail Connected
                </span>
              )}
              {isGmailConnected && (
                <span className="px-2.5 py-1 bg-primary/10 text-primary text-xs rounded-full border border-primary/20 flex items-center gap-1 font-medium">
                  <span className="w-1.5 h-1.5 bg-primary rounded-full"></span> Calendar Connected
                </span>
              )}
              {contextThumbnails.length > 0 && (
                <span className="px-2.5 py-1 bg-highlight text-primary text-xs rounded-full border border-primary/20 font-medium">
                  {contextThumbnails.length} Screens
                </span>
              )}
            </div>
          </div>
        </header>

        {/* CONTENT AREA */}
        <main className="p-8 max-w-5xl w-full mx-auto flex-grow">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-text/60">
              <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
              <h3 className="text-xl font-serif text-text mb-2">Connecting to your Google account...</h3>
              <p className="text-sm text-text/50">Analyzing your latest emails, tasks, and calendar events.</p>
            </div>

          ) : (
            <>
          {/* SECTION A: Week at a Glance */}
          {activeSection === 'week' && (
            <div className="space-y-6">
              {/* Today's Focus Card */}
              <motion.div 
                initial={{ opacity: 0, y: -20 }} 
                animate={{ opacity: 1, y: 0 }} 
                className="bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 p-6 rounded-soft shadow-soft relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center relative z-10">
                  <div className="bg-background/80 p-3 rounded-full border border-border shrink-0">
                    <Sun className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-serif text-text mb-2">{greeting}, {userName || 'Ranja'}.</h2>
                    <p className="text-sm text-text/80 leading-relaxed max-w-3xl">
                      You have <strong className="text-text">{tasks.filter(t => !t.isDone).length} tasks</strong> remaining and <strong className="text-text">{emails.filter(e => !hiddenEmails.has(e.id)).length} unread emails</strong>. Your stress load is currently <strong className={stressLevel > 7 ? 'text-urgency' : 'text-text'}>{stressLevel}/10</strong>.
                      <br/>
                      <span className="text-primary font-medium mt-1 inline-block">Suggested Focus:</span> Start by clearing your most urgent tasks before your next calendar event.
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* KPI Stats Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="bg-highlight border border-border border-l-4 border-l-primary p-4 rounded-soft shadow-soft hover:shadow-soft-hover transition-all duration-200">
                  <div className="text-xs text-text/50 font-medium uppercase mb-1 tracking-wider">Open Tasks</div>
                  <div className="text-3xl font-serif text-text">{tasks.filter(t => !t.isDone).length}</div>
                  <div className="text-[10px] font-medium text-urgency flex items-center gap-1 mt-1">
                    {(tasks.filter(t => !t.isDone).length - (initialTaskCount ?? 0)) >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />} 
                    {getTaskTrendText()}
                  </div>
                </div>
                <div className="bg-highlight border border-border border-l-4 border-l-secondary p-4 rounded-soft shadow-soft hover:shadow-soft-hover transition-all duration-200">
                  <div className="text-xs text-text/50 font-medium uppercase mb-1 tracking-wider">Unread Emails</div>
                  <div className="text-3xl font-serif text-text">{emails.filter(e => !hiddenEmails.has(e.id)).length}</div>
                  <div className="text-[10px] font-medium text-secondary flex items-center gap-1 mt-1">
                    {(emails.filter(e => !hiddenEmails.has(e.id)).length - (initialEmailCount ?? 0)) > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />} 
                    {getEmailTrendText()}
                  </div>
                </div>
                <div className={`bg-highlight border border-border border-l-4 p-4 rounded-soft shadow-soft hover:shadow-soft-hover transition-all duration-200 ${stressLevel > 7 ? 'border-l-urgency' : stressLevel > 4 ? 'border-l-[#d69e2e]' : 'border-l-primary'}`}>
                  <div className="text-xs text-text/50 font-medium uppercase mb-1 tracking-wider">Stress Load</div>
                  <div className={`text-3xl font-serif ${stressLevel > 7 ? 'text-urgency' : stressLevel > 4 ? 'text-[#d69e2e]' : 'text-text'}`}>{stressLevel}/10</div>
                  <div className="text-[10px] font-medium text-text/50 flex items-center gap-1 mt-1">
                    {(stressLevel - (initialStressLevel ?? 0)) > 0 ? <TrendingUp className="w-3 h-3" /> : (stressLevel - (initialStressLevel ?? 0)) < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />} 
                    {getStressTrendText()}
                  </div>
                </div>
                <div className="bg-highlight border border-border border-l-4 border-l-[#7b6ea0] p-4 rounded-soft shadow-soft hover:shadow-soft-hover transition-all duration-200">
                  <div className="text-xs text-text/50 font-medium uppercase mb-1 tracking-wider">Key Events</div>
                  <div className="text-3xl font-serif text-text">{events.length}</div>
                  <div className="text-[10px] font-medium text-secondary flex items-center gap-1 mt-1">
                    {(events.length - (initialEventCount ?? 0)) >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />} 
                    {getEventTrendText()}
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <h3 className="text-lg font-serif text-text">Schedule Breakdown</h3>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => {
                      const mdContent = "# My Weekly Action Plan\n\n" + actionPlan.map(day => `## ${day.dayName}\n\n**Morning:** ${day.morningFocus?.task || 'None'}\n**Afternoon:** ${day.afternoonBlock?.task || 'None'}\n**Evening:** ${day.eveningWrapUp?.task || 'None'}\n`).join('\n');
                      const blob = new Blob([mdContent], { type: 'text/markdown' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'DeadlineGPT_ActionPlan.md';
                      a.click();
                      showToast('Plan exported as Markdown');
                    }}
                    title="Export Plan (Ctrl+E)"
                    className="text-xs flex items-center gap-1.5 bg-highlight hover:bg-accent border border-border px-3 py-1.5 rounded-full transition-colors font-medium text-text/80"
                  >
                    <Download className="w-3.5 h-3.5" /> 
                    Export
                  </button>
                  <button 
                    onClick={() => generatePlan(tasks.filter(t => !t.isDone), events)}
                    disabled={isPlanGenerating}
                    title="Refresh Schedule (R)"
                    className="text-xs flex items-center gap-1.5 bg-highlight hover:bg-accent border border-border px-3 py-1.5 rounded-full transition-colors font-medium disabled:opacity-50 text-text/80"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isPlanGenerating ? 'animate-spin' : ''}`} /> 
                    Refresh Plan
                  </button>
                </div>
              </div>
              {actionPlan && actionPlan[0]?.isMock && (
                <div className="bg-urgency/10 border border-urgency/20 text-urgency p-4 rounded-soft text-sm font-medium flex items-center gap-2 shadow-soft">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <span>You are currently viewing mock scheduler data. (Gemini API rate-limited or offline).</span>
                </div>
              )}
              {(!actionPlan || actionPlan.length === 0) ? (
                <div className="flex flex-col items-center justify-center p-12 bg-highlight border border-border rounded-soft text-center h-64">
                  <Calendar className="w-12 h-12 text-primary mb-4 opacity-50" />
                  <h3 className="text-xl font-serif text-text mb-2">No Plan Generated Yet</h3>
                  <p className="text-text/60">Connect your calendar or upload context to generate your week at a glance.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {(actionPlan || []).map((day, i) => {
                  const hasTasks = day.morningFocus || day.afternoonBlock || day.eveningWrapUp;
                  const isWeekend = day.dayName === 'Saturday' || day.dayName === 'Sunday';
                  const calendarEvents = day.calendarEvents || [];
                  let statusColor = 'bg-secondary/10 border-secondary/20 text-secondary';
                  let statusLabel = 'manageable';
                  
                  if (calendarEvents.length > 0 && hasTasks) {
                    statusColor = 'bg-urgency/10 border-urgency/20 text-urgency';
                    statusLabel = 'overloaded';
                  } else if (hasTasks) {
                    statusColor = 'bg-highlight border-primary/20 text-primary';
                    statusLabel = 'busy';
                  }

                  return (
                    <div 
                      key={i} 
                      className={`border rounded-soft p-5 bg-highlight shadow-soft hover:shadow-soft-hover transition-all duration-200 cursor-pointer ${isWeekend ? 'opacity-70' : ''}`}
                      onClick={() => {
                        setActiveSection('plan');
                        setTimeout(() => {
                          const el = document.getElementById(`plan-day-${i}`);
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 100);
                      }}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="font-semibold text-text">{day.dayName}</h3>
                          <span className="text-xs text-text/50">{day.date}</span>
                        </div>
                        {!isWeekend && (
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${statusColor}`}>
                            {statusLabel}
                          </span>
                        )}
                      </div>
                      
                      <div className="space-y-2 text-sm text-text/75">
                        {calendarEvents.length > 0 && (
                          <div className="flex items-center gap-1.5 text-xs text-text/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                            {calendarEvents.length} scheduled events
                          </div>
                        )}
                        {hasTasks ? (
                          <div className="mt-3 pt-3 border-t border-border/30 space-y-1.5">
                            {day.morningFocus && (
                              <div className="text-[11px] text-text/70 truncate flex items-center gap-1">
                                <span className="w-1 h-1 rounded-full bg-primary shrink-0"></span>
                                <span className="font-semibold text-text/40 uppercase text-[9px] mr-0.5">AM:</span>
                                <span className="truncate" title={day.morningFocus.task}>{day.morningFocus.task}</span>
                              </div>
                            )}
                            {day.afternoonBlock && (
                              <div className="text-[11px] text-text/70 truncate flex items-center gap-1">
                                <span className="w-1 h-1 rounded-full bg-secondary shrink-0"></span>
                                <span className="font-semibold text-text/40 uppercase text-[9px] mr-0.5">PM:</span>
                                <span className="truncate" title={day.afternoonBlock.task}>{day.afternoonBlock.task}</span>
                              </div>
                            )}
                            {day.eveningWrapUp && (
                              <div className="text-[11px] text-text/70 truncate flex items-center gap-1">
                                <span className="w-1 h-1 rounded-full bg-accent shrink-0"></span>
                                <span className="font-semibold text-text/40 uppercase text-[9px] mr-0.5">EV:</span>
                                <span className="truncate" title={day.eveningWrapUp.task}>{day.eveningWrapUp.task}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs text-text/40 italic">
                            No planned tasks
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          )}

          {/* SECTION B: Inbox Intelligence */}
          {activeSection === 'inbox' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <p className="text-sm text-text/60 italic">Identified actionable requests from Gmail and manual inputs</p>
              </div>

              <div className="space-y-4">
                {emails.filter(email => !hiddenEmails.has(email.id) && email.summary !== "No immediate action required.").length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 bg-highlight border border-border rounded-soft text-center h-64">
                    <Inbox className="w-12 h-12 text-text/20 mb-4" />
                    <h3 className="text-xl font-serif text-text mb-2">Your inbox is clear!</h3>
                    <p className="text-sm text-text/60">No actionable emails found right now. Take a deep breath.</p>
                  </div>
                ) : (
                  emails.filter(email => !hiddenEmails.has(email.id) && email.summary !== "No immediate action required.")
                        .slice((emailPage - 1) * emailsPerPage, emailPage * emailsPerPage)
                        .map((email) => (
                  <div key={email.id} className="bg-highlight border border-border rounded-soft p-6 shadow-soft hover:shadow-soft-hover transition-all duration-200">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <span className="font-semibold text-text">{email.sender}</span>
                          <span className="px-2 py-0.5 bg-accent text-text/50 text-[10px] rounded-full border border-border">
                            {email.source}
                          </span>
                          {email.deadline && (
                            <span className="px-2 py-0.5 bg-urgency/10 text-urgency text-[10px] rounded-full font-bold flex items-center gap-1 border border-urgency/20">
                              <Clock className="w-3 h-3" /> {email.deadline}
                            </span>
                          )}
                        </div>
                        <h4 className="font-medium text-text">{email.subject}</h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text/50">Urgency:</span>
                        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${email.urgency > 7 ? 'bg-urgency/10 text-urgency border border-urgency/20' : 'bg-primary/10 text-primary border border-primary/20'}`}>
                          {email.urgency || '-'}/10
                        </span>
                      </div>
                    </div>

                    <p className="text-sm text-text/60 italic mb-6">
                      {email.summary ? `Summary: ${email.summary}` : 'Analyzing email content...'}
                    </p>

                    <div className="flex gap-3 flex-wrap">
                      <button 
                        onClick={() => handleDraftReply(email)}
                        className="bg-primary hover:bg-[#c96645] text-white text-sm py-2 px-4 rounded-soft font-medium transition-colors duration-150"
                      >
                        Draft Reply
                      </button>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(email.summary);
                          showToast('Copied summary context to clipboard');
                        }}
                        className="border border-border hover:bg-accent text-text/70 text-sm py-2 px-4 rounded-soft font-medium transition-colors duration-150"
                      >
                        Copy Summary
                      </button>
                      <button 
                        onClick={() => {
                          setHiddenEmails(prev => {
                            const newSet = new Set(prev);
                            newSet.add(email.id);
                            return newSet;
                          });
                          showToast('Email snoozed for later');
                        }}
                        className="text-text/40 hover:text-text/70 text-sm py-2 px-4 transition-colors font-medium"
                      >
                        Snooze
                      </button>
                    </div>
                  </div>
                ))
                )}
              </div>

              {emails.filter(email => !hiddenEmails.has(email.id) && email.summary !== "No immediate action required.").length > emailsPerPage && (
                <div className="flex justify-between items-center mt-6 pt-4 border-t border-border">
                  <button 
                    onClick={() => setEmailPage(p => Math.max(1, p - 1))}
                    disabled={emailPage === 1}
                    className="flex items-center gap-2 px-4 py-2 rounded-soft bg-highlight border border-border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-text/80"
                  >
                    <ChevronRight className="w-4 h-4 rotate-180" /> Previous
                  </button>
                  <span className="text-sm text-text/60 font-medium">
                    Page {emailPage} of {Math.ceil(emails.filter(email => !hiddenEmails.has(email.id) && email.summary !== "No immediate action required.").length / emailsPerPage)}
                  </span>
                  <button 
                    onClick={() => setEmailPage(p => Math.min(Math.ceil(emails.filter(email => !hiddenEmails.has(email.id) && email.summary !== "No immediate action required.").length / emailsPerPage), p + 1))}
                    disabled={emailPage === Math.ceil(emails.filter(email => !hiddenEmails.has(email.id) && email.summary !== "No immediate action required.").length / emailsPerPage)}
                    className="flex items-center gap-2 px-4 py-2 rounded-soft bg-highlight border border-border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-text/80"
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SECTION C: Action Plan */}
          {activeSection === 'plan' && (
            <div className="space-y-8 relative">
              {isPlanGenerating && (
                <div className="absolute inset-0 bg-background/50 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-soft">
                  <div className="bg-highlight border border-border p-4 rounded-soft shadow-soft flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    <span className="text-text font-medium">Regenerating Action Plan...</span>
                  </div>
                </div>
              )}
              {actionPlan && actionPlan[0]?.isMock && (
                <div className="bg-urgency/10 border border-urgency/20 text-urgency p-4 rounded-soft text-sm font-medium flex items-center gap-2 shadow-soft">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <span>You are currently viewing mock scheduler data. (Gemini API rate-limited or offline).</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <p className="text-sm text-text/60 italic">Your AI-scheduled agenda mapped around calendar events</p>
                <button 
                  onClick={() => {
                    setPomodoroTask({ title: 'Focus Session' });
                    setIsPomodoroActive(true);
                  }}
                  className="bg-primary hover:bg-[#c96645] text-white text-sm py-2.5 px-5 rounded-soft font-medium transition-colors duration-150 flex items-center gap-2"
                >
                  <Clock className="w-4 h-4" /> Start 25-min Timer
                </button>
              </div>

              <motion.div layout className="space-y-6">
                {actionPlan.map((day, idx) => (
                  <motion.div id={`plan-day-${idx}`} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }} key={idx} className="bg-highlight border border-border rounded-soft p-6 shadow-soft">
                    <div className="border-b border-border pb-4 mb-4 flex justify-between items-center">
                      <h3 className="text-lg font-serif text-text">{day.dayName} — {day.date}</h3>
                      <span className="text-xs text-text/40 italic">{day.motivationalMessage}</span>
                    </div>

                    {(!day.morningFocus && !day.afternoonBlock && !day.eveningWrapUp) ? (
                      <div className="py-12 text-center bg-accent/20 rounded-soft border border-dashed border-border/50">
                        <h4 className="text-text/70 font-serif text-xl mb-2 uppercase">NO TASKS SCHEDULED FOR {day.dayName}, {day.date}</h4>
                        <p className="text-sm text-text/50">Enjoy your free time or add a task to get started.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Morning Focus */}
                        <div className={`p-4 rounded-soft border border-l-4 ${completedBlocks[`${idx}-morning`] ? 'bg-secondary/10 border-secondary/30 border-l-[#8a968a]' : 'bg-accent/30 border-border/50 border-l-[#d69e2e]'}`}>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs text-text/40 font-semibold uppercase tracking-wider block">Morning Focus (2 hrs)</span>
                            {day.morningFocus && (
                              <button 
                                onClick={() => setCompletedBlocks(prev => ({...prev, [`${idx}-morning`]: !prev[`${idx}-morning`]}))}
                                className={`w-5 h-5 rounded flex items-center justify-center transition-all duration-200 border cursor-pointer ${completedBlocks[`${idx}-morning`] ? 'bg-secondary border-secondary text-white scale-110 shadow-sm' : 'border-text/30 bg-transparent text-transparent hover:border-secondary'}`}
                              >
                                <Check className="w-3.5 h-3.5" strokeWidth={3} />
                              </button>
                            )}
                          </div>
                          {day.morningFocus ? (
                            <div className={completedBlocks[`${idx}-morning`] ? 'opacity-60 line-through' : ''}>
                              <h4 className="font-semibold text-text mb-1">{day.morningFocus.task}</h4>
                              <p className="text-xs text-text/60 italic mb-3">Goal: {day.morningFocus.goal}</p>
                              <ul className="text-xs text-text/70 space-y-1 mb-4">
                                {(day.morningFocus.specificActions || []).map((act, i) => (
                                  <li key={i} className="flex items-start gap-1">
                                    <span className="text-primary mt-0.5">•</span>
                                    {act}
                                  </li>
                                ))}
                              </ul>
                              <button 
                                disabled={completedBlocks[`${idx}-morning`]}
                                onClick={() => { setPomodoroTask({ title: day.morningFocus.task }); setIsPomodoroActive(true); }} 
                                className="w-full border border-primary/30 hover:border-primary bg-highlight text-primary text-xs py-1.5 rounded-soft font-medium transition-colors disabled:opacity-50 disabled:hover:border-primary/30 disabled:cursor-not-allowed"
                              >
                                Start Session
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-text/30 italic">No scheduled task</span>
                          )}
                        </div>

                        {/* Afternoon Block */}
                        <div className={`p-4 rounded-soft border border-l-4 ${completedBlocks[`${idx}-afternoon`] ? 'bg-secondary/10 border-secondary/30 border-l-[#8a968a]' : 'bg-accent/30 border-border/50 border-l-primary'}`}>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs text-text/40 font-semibold uppercase tracking-wider block">Afternoon Block (3 hrs)</span>
                            {day.afternoonBlock && (
                              <button 
                                onClick={() => setCompletedBlocks(prev => ({...prev, [`${idx}-afternoon`]: !prev[`${idx}-afternoon`]}))}
                                className={`w-5 h-5 rounded flex items-center justify-center transition-all duration-200 border cursor-pointer ${completedBlocks[`${idx}-afternoon`] ? 'bg-secondary border-secondary text-white scale-110 shadow-sm' : 'border-text/30 bg-transparent text-transparent hover:border-secondary'}`}
                              >
                                <Check className="w-3.5 h-3.5" strokeWidth={3} />
                              </button>
                            )}
                          </div>
                          {day.afternoonBlock ? (
                            <div className={completedBlocks[`${idx}-afternoon`] ? 'opacity-60 line-through' : ''}>
                              <h4 className="font-semibold text-text mb-1">{day.afternoonBlock.task}</h4>
                              <p className="text-xs text-text/60 italic mb-3">Goal: {day.afternoonBlock.goal}</p>
                              <ul className="text-xs text-text/70 space-y-1 mb-4">
                                {(day.afternoonBlock.specificActions || []).map((act, i) => (
                                  <li key={i} className="flex items-start gap-1">
                                    <span className="text-primary mt-0.5">•</span>
                                    {act}
                                  </li>
                                ))}
                              </ul>
                              <button 
                                disabled={completedBlocks[`${idx}-afternoon`]}
                                onClick={() => { setPomodoroTask({ title: day.afternoonBlock.task }); setIsPomodoroActive(true); }} 
                                className="w-full border border-primary/30 hover:border-primary bg-highlight text-primary text-xs py-1.5 rounded-soft font-medium transition-colors disabled:opacity-50 disabled:hover:border-primary/30 disabled:cursor-not-allowed"
                              >
                                Start Session
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-text/30 italic">No scheduled task</span>
                          )}
                        </div>

                        {/* Evening Wrap-Up */}
                        <div className={`p-4 rounded-soft border border-l-4 ${completedBlocks[`${idx}-evening`] ? 'bg-secondary/10 border-secondary/30 border-l-[#8a968a]' : 'bg-accent/30 border-border/50 border-l-secondary'}`}>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs text-text/40 font-semibold uppercase tracking-wider block">Evening Wrap-Up (1 hr)</span>
                            {day.eveningWrapUp && (
                              <button 
                                onClick={() => setCompletedBlocks(prev => ({...prev, [`${idx}-evening`]: !prev[`${idx}-evening`]}))}
                                className={`w-5 h-5 rounded flex items-center justify-center transition-all duration-200 border cursor-pointer ${completedBlocks[`${idx}-evening`] ? 'bg-secondary border-secondary text-white scale-110 shadow-sm' : 'border-text/30 bg-transparent text-transparent hover:border-secondary'}`}
                              >
                                <Check className="w-3.5 h-3.5" strokeWidth={3} />
                              </button>
                            )}
                          </div>
                          {day.eveningWrapUp ? (
                            <div className={completedBlocks[`${idx}-evening`] ? 'opacity-60 line-through' : ''}>
                              <h4 className="font-semibold text-text mb-1">{day.eveningWrapUp.task}</h4>
                              <p className="text-xs text-text/60 italic mb-3">Goal: {day.eveningWrapUp.goal}</p>
                              <ul className="text-xs text-text/70 space-y-1 mb-4">
                                {(day.eveningWrapUp.specificActions || []).map((act, i) => (
                                  <li key={i} className="flex items-start gap-1">
                                    <span className="text-primary mt-0.5">•</span>
                                    {act}
                                  </li>
                                ))}
                              </ul>
                              <button 
                                disabled={completedBlocks[`${idx}-evening`]}
                                onClick={() => { setPomodoroTask({ title: day.eveningWrapUp.task }); setIsPomodoroActive(true); }} 
                                className="w-full border border-primary/30 hover:border-primary bg-highlight text-primary text-xs py-1.5 rounded-soft font-medium transition-colors disabled:opacity-50 disabled:hover:border-primary/30 disabled:cursor-not-allowed"
                              >
                                Start Session
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-text/30 italic">No scheduled task</span>
                          )}
                        </div>
                      </div>
                    )}

                    {day.calendarEvents && day.calendarEvents.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-border flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-text/50 font-medium">Calendar Conflicts:</span>
                        {(day.calendarEvents || []).map((evt, idx) => (
                          <span key={idx} className="bg-accent border border-border text-text/60 text-xs px-2.5 py-0.5 rounded-full">
                            {evt}
                          </span>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ))}
              </motion.div>
            </div>
          )}

          {/* SECTION D: Task Command Center */}
          {activeSection === 'tasks' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <p className="text-sm text-text/60 italic">Sorted by calculated priority and deadlines</p>
                <button 
                  onClick={() => setIsAddTaskModalOpen(true)}
                  title="Shortcut: A"
                  className="bg-primary hover:bg-[#c96645] text-white text-sm py-2 px-4 rounded-soft font-medium transition-colors duration-150 flex items-center gap-1.5"
                >
                  <PlusCircle className="w-4 h-4" /> Add Task Manually
                </button>
              </div>

              <motion.div className="space-y-4">
                <AnimatePresence>
                {tasks.length === 0 ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center p-12 bg-highlight border border-border rounded-soft text-center h-64">
                    <CheckSquare className="w-12 h-12 text-text/20 mb-4" />
                    <h3 className="text-xl font-serif text-text mb-2">Your task list is empty</h3>
                    <p className="text-sm text-text/60">Add a task manually or let DeadlineGPT scan your inbox to find action items.</p>
                  </motion.div>
                ) : (
                  [...tasks].sort((a, b) => (a.isDone === b.isDone) ? 0 : a.isDone ? 1 : -1).map((task) => (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.3 }} key={task.id} className={`bg-highlight border rounded-soft p-5 shadow-soft transition-all duration-200 ${task.isDone ? 'bg-[#1c241c] border-secondary/50 opacity-80' : 'border-border hover:shadow-soft-hover'}`}>
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h4 className={`font-semibold text-lg ${task.isDone ? 'text-text/60 line-through' : 'text-text'}`}>{task.title}</h4>
                          <span className="px-2 py-0.5 bg-accent text-text/50 text-[10px] rounded-full border border-border font-medium">
                            {task.source}
                          </span>
                        </div>
                        <div className="text-xs font-medium flex items-center gap-1.5 mt-1.5 mb-1 text-text/70">
                          <Clock className={`w-3.5 h-3.5 ${(task.priority || 5) > 7 ? 'text-urgency' : 'text-text/50'}`} />
                          <span>Deadline: {task.deadline}</span>
                        </div>
                        <div className="w-full h-1 bg-border rounded-full overflow-hidden max-w-[180px]">
                           <div className={`h-full transition-all ${(task.priority || 5) > 7 ? 'bg-urgency w-[90%]' : (task.priority || 5) > 4 ? 'bg-[#d69e2e] w-[60%]' : 'bg-primary w-[30%]'}`}></div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4 shrink-0">
                        {task.isDone && (
                          <span className="text-xs font-bold text-secondary bg-secondary/10 px-3 py-1 rounded-full border border-secondary/30 flex items-center gap-1">
                            ✓ Marked as Done
                          </span>
                        )}
                        <span className="text-xs text-text/50">
                          Estimate: {task.effortHours}h
                        </span>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-text/50">Priority:</span>
                          <select 
                            value={task.priority || 5} 
                            onChange={(e) => {
                              const newPriority = parseInt(e.target.value);
                              setTasks(prev => prev.map(t => t.id === task.id ? { ...t, priority: newPriority } : t));
                            }}
                            className={`text-xs font-semibold px-2.5 py-0.5 rounded-full bg-highlight border ${(task.priority || 5) > 7 ? 'text-urgency border-urgency/20' : 'text-primary border-primary/20'} focus:outline-none cursor-pointer`}
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(val => (
                              <option key={val} value={val} className="bg-background text-text">{val}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <p className={`text-sm italic mb-5 ${task.isDone ? 'text-text/40' : 'text-text/60'}`}>
                      Action Required: {task.actionNeeded}
                    </p>

                    <div className="flex gap-2.5 flex-wrap">
                      {!task.isDone ? (
                        <>
                          <button 
                            onClick={() => {
                              setTasks(prev => prev.map(t => t.id === task.id ? { ...t, isDone: true } : t));
                              showToast('Task completed!');
                            }}
                            className="bg-secondary hover:bg-[#8a968a] text-white text-xs py-2 px-4 rounded-soft font-medium transition-colors"
                          >
                            Mark Done
                          </button>
                          <button 
                            onClick={() => setPanicTask(task)}
                            className="bg-urgency hover:bg-[#b04d30] text-white text-xs py-2 px-4 rounded-soft font-medium transition-colors"
                          >
                            Panic Mode
                          </button>
                          <button 
                            onClick={() => handleDraftDocument(task)}
                            className="border border-primary/30 hover:border-primary text-primary text-xs py-2 px-4 rounded-soft font-medium transition-colors"
                          >
                            Draft Document
                          </button>
                          <button 
                            onClick={() => {
                              setTasks(prev => {
                                const updated = prev.filter(t => t.id !== task.id);
                                debouncedGeneratePlan(updated.filter(u => !u.isDone), events);
                                return updated;
                              });
                              showToast('Task deleted');
                            }}
                            className="border border-urgency/40 hover:bg-urgency/10 text-urgency text-xs py-2 px-4 rounded-soft font-medium transition-colors"
                          >
                            Delete
                          </button>
                          <button 
                            onClick={() => setEditingTask(task)}
                            className="border border-border hover:bg-border/50 text-text/70 text-xs py-2 px-4 rounded-soft font-medium transition-colors"
                          >
                            Edit
                          </button>
                        </>
                      ) : (
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setTasks(prev => prev.map(t => t.id === task.id ? { ...t, isDone: false } : t))}
                            className="border border-secondary/50 hover:border-secondary text-secondary text-xs py-1.5 px-4 rounded-soft font-medium transition-colors"
                          >
                            Undo
                          </button>
                          <button 
                            onClick={() => {
                              setTasks(prev => {
                                const updated = prev.filter(t => t.id !== task.id);
                                debouncedGeneratePlan(updated.filter(u => !u.isDone), events);
                                return updated;
                              });
                              showToast('Task deleted');
                            }}
                            className="border border-urgency/40 hover:bg-urgency/10 text-urgency text-xs py-1.5 px-4 rounded-soft font-medium transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )))}
                </AnimatePresence>
              </motion.div>
            </div>
          )}

          {/* SECTION E: Nudge Center */}
          {activeSection === 'nudges' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <p className="text-sm text-text/60 italic">Real-time alerts that escalate in tone as deadlines approach</p>
                <button 
                  onClick={() => {
                    const newNudge = {
                      id: Date.now(),
                      task: 'Check-in: Focus Session',
                      message: 'Are you staying on track? Make sure you focus on your high priority items.',
                      timeLeft: 'Just Now',
                      tone: 'firm',
                      action: 'Acknowledge'
                    };
                    setNudges([newNudge, ...nudges]);
                    if ('Notification' in window && Notification.permission === 'granted') {
                      new Notification('DeadlineGPT Nudge', { body: newNudge.message });
                    }
                  }}
                  className="bg-primary hover:bg-[#c96645] text-white text-sm py-2 px-4 rounded-soft font-medium transition-colors duration-150 flex items-center gap-1.5"
                >
                  <Bell className="w-4 h-4" /> Generate Nudge Now
                </button>
              </div>
              
              {(!nudges || nudges.length === 0) ? (
                <div className="flex flex-col items-center justify-center p-12 bg-highlight border border-border rounded-soft text-center h-64">
                  <Bell className="w-12 h-12 text-primary mb-4 opacity-50" />
                  <h3 className="text-xl font-serif text-text mb-2">All Quiet For Now</h3>
                  <p className="text-text/60">We'll alert you when deadlines start creeping up. Check back later!</p>
                </div>
              ) : (
                <motion.div layout className="space-y-4">
                  <AnimatePresence>
                {nudges.map((nudge) => (
                  <motion.div 
                    layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                    key={nudge.id} 
                    className={`bg-highlight border rounded-soft p-5 shadow-soft transition-all duration-200 ${
                      nudge.tone === 'urgent' ? 'border-urgency/40' : 'border-primary/20'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <h4 className="font-serif font-semibold text-text">{nudge.task}</h4>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        nudge.tone === 'urgent' ? 'bg-urgency/10 text-urgency' : 'bg-primary/10 text-primary'
                      }`}>
                        {nudge.timeLeft}
                      </span>
                    </div>

                    <p className="text-sm text-text/70 mb-4">{nudge.message}</p>
                    
                    <button 
                      onClick={() => {
                        showToast(`Action started: ${nudge.action}`);
                        setNudges(prev => prev.filter(n => n.id !== nudge.id));
                      }}
                      className={`text-xs font-medium py-1.5 px-3 rounded-soft border transition-all ${
                        nudge.tone === 'urgent' 
                          ? 'bg-urgency text-white border-urgency hover:bg-[#b04d30]' 
                          : 'bg-highlight text-primary border-primary/30 hover:border-primary'
                      }`}
                    >
                      {nudge.action}
                    </button>
                  </motion.div>
                ))}
                </AnimatePresence>
              </motion.div>
              )}
            </div>
          )}

          {/* SECTION F: Add Context */}
          {activeSection === 'context' && (
            <div className="bg-highlight border border-border rounded-soft p-6 shadow-soft space-y-6">
              <div>
                <h3 className="text-lg font-serif text-text mb-2">Supplement your Schedule</h3>
                <p className="text-sm text-text/60">Upload screenshots or paste emails to dynamically recalculate your plan.</p>
              </div>

              <div className="space-y-4">
                <textarea 
                  className="w-full h-32 p-4 bg-accent/30 border border-border rounded-soft focus:outline-none focus:border-primary/50 resize-none text-sm text-text"
                  placeholder="Paste details here..."
                  value={manualText}
                  onChange={e => setManualText(e.target.value)}
                ></textarea>
                
                <label className="border-2 border-dashed border-border hover:border-primary/50 bg-accent/10 rounded-soft p-6 text-center cursor-pointer transition-colors block">
                  <UploadCloud className="w-8 h-8 text-primary mx-auto mb-2" />
                  <span className="text-sm text-text/70 block">Drag screenshots, click to browse, or just paste (Ctrl+V) anywhere</span>
                  <span className="text-xs text-text/40">Accepts PNG, JPG, WEBP</span>
                  <input type="file" multiple className="hidden" accept="image/png, image/jpeg, image/webp" onChange={(e) => {
                    const files = Array.from(e.target.files);
                    if (files.length > 0) {
                      setContextThumbnails(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
                    }
                  }} />
                </label>

                {contextThumbnails.length > 0 && (
                  <div className="flex gap-4 p-4 bg-highlight rounded-soft overflow-x-auto mt-4">
                    <AnimatePresence>
                    {contextThumbnails.map((src, i) => (
                      <motion.div layout initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} key={i} className="relative shrink-0 group">
                        <img src={src} className="w-24 h-24 object-cover rounded-md border border-border" alt="upload preview" />
                        <button 
                          onClick={() => setContextThumbnails(prev => prev.filter((_, idx) => idx !== i))}
                          className="absolute -top-2 -right-2 bg-highlight rounded-full p-1 shadow-sm border border-border text-text/50 hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </motion.div>
                    ))}
                    </AnimatePresence>
                  </div>
                )}

                <button 
                  onClick={async () => {
                    setIsLoading(true);
                    try {
                      let tasksFromManual = [];
                      if (contextThumbnails.length > 0) {
                        const formData = new FormData();
                        for (const url of contextThumbnails) {
                          const res = await fetch(url);
                          const blob = await res.blob();
                          formData.append('screenshots', blob, 'screenshot.png');
                        }
                        const uploadRes = await fetch('/api/manual-screenshot', {
                          method: 'POST',
                          body: formData
                        });
                        if (uploadRes.ok) {
                          const uploadData = await uploadRes.json();
                          if (uploadData.tasks) tasksFromManual.push(...uploadData.tasks);
                        }
                      }

                      // Re-trigger analysis with new context
                      const analysisRes = await fetch('/api/analyze', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ emails, events, manualData: { text: manualText, tasks: tasksFromManual } })
                      });
                      
                      if (analysisRes.ok) {
                        const analysis = await analysisRes.json();
                        const newTasksWithIds = (analysis.tasks || []).map((t, i) => ({ ...t, id: t.id ? `${t.id}-${i}-${Date.now()}` : `task-${i}-${Date.now()}` }));
                        setTasks(newTasksWithIds);
                        if (analysis.overallStressLevel) setStressLevel(analysis.overallStressLevel);
                        
                        const planRes = await fetch('/api/action-plan', {
                           method: 'POST',
                           headers: { 'Content-Type': 'application/json' },
                           credentials: 'include',
                           body: JSON.stringify({ tasks: analysis.tasks || [], events })
                        });
                        if (planRes.ok) {
                           const planData = await planRes.json();
                           setActionPlan(planData);
                        }
                      }
                      
                      setContextThumbnails([]);
                      setManualText('');
                      setActiveSection('week');
                    } catch (err) {
                      console.error(err);
                      setError('Failed to process manual context.');
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  className="w-full bg-primary hover:bg-[#c96645] text-white py-3 rounded-soft font-medium transition-colors"
                >
                  Update Actions
                </button>
              </div>
            </div>
          )}
          </>
          )}
        </main>
      </div>

      {/* EMAIL DRAFTING MODAL */}
      <AnimatePresence>
      {draftingEmail && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-text/45 flex items-center justify-center p-4 z-50">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-highlight border border-border rounded-[12px] max-w-xl w-full p-6 shadow-soft-hover space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="text-lg font-semibold text-text">Drafting Email Reply</h3>
              <button onClick={() => setDraftingEmail(null)} className="text-text/40 hover:text-text/70">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-text/50 font-semibold block mb-1">Subject</label>
                <input 
                  type="text" 
                  value={draftingEmail.subject} 
                  onChange={(e) => setDraftingEmail({...draftingEmail, subject: e.target.value})}
                  className="w-full border border-border p-2.5 rounded-soft text-sm text-text focus:outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <label className="text-xs text-text/50 font-semibold block mb-1">Body</label>
                <textarea 
                  value={draftingEmail.body} 
                  onChange={(e) => setDraftingEmail({...draftingEmail, body: e.target.value})}
                  className="w-full h-48 border border-border p-2.5 rounded-soft text-sm text-text focus:outline-none focus:border-primary/50 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <div className="text-[10px] text-text/40 flex gap-4">
                <span>Tone: {draftingEmail.tone}</span>
                <span>Read Time: {draftingEmail.readTime}</span>
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={handleCopyDraft}
                  className="border border-border hover:bg-accent text-text/70 text-xs py-2 px-4 rounded-soft font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" /> Copy Draft
                </button>
                <button 
                  onClick={handleSendEmail}
                  className="bg-secondary hover:bg-[#8a968a] text-white text-xs py-2 px-4 rounded-soft font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" /> Send Response
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>


      {/* DRAFT DOCUMENT MODAL */}
      <AnimatePresence>
      {draftingDocument && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-text/45 flex items-center justify-center p-4 z-50">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-highlight border border-border rounded-[12px] max-w-2xl w-full p-6 shadow-soft-hover space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="text-lg font-semibold text-text">Drafting Document: {draftingDocument.task.title}</h3>
              <button onClick={() => setDraftingDocument(null)} className="text-text/40 hover:text-text/70">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-3">
              <div className="w-full h-80 overflow-y-auto border border-border p-5 rounded-soft text-sm text-text bg-background font-sans relative">
                <div className="prose prose-sm prose-invert max-w-none prose-table:border-collapse prose-th:border prose-th:border-border prose-th:bg-accent prose-th:p-2 prose-td:border prose-td:border-border prose-td:p-2 prose-a:text-primary">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {draftingDocument.content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-between items-center">
              <span className="text-xs text-text/50">{draftingDocument.isLoading ? 'Generating with AI...' : 'Draft completed'}</span>

              <button 
                onClick={() => {
                  navigator.clipboard.writeText(draftingDocument.content);
                  showToast('Document copied to clipboard!');
                }}
                disabled={draftingDocument.isLoading}
                className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-white text-sm py-2 px-6 rounded-soft font-semibold transition-colors flex items-center gap-2"
              >
                <Copy className="w-4 h-4" /> Copy Document
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* ADD TASK MODAL */}
      <AnimatePresence>
      {isAddTaskModalOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-text/45 flex items-center justify-center p-4 z-50">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-highlight border border-border rounded-[12px] max-w-md w-full p-6 shadow-soft-hover space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="text-lg font-semibold text-text">Add Task Manually</h3>
              <button onClick={() => { setIsAddTaskModalOpen(false); setTaskFormError(''); }} className="text-text/40 hover:text-text/70">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text/50 font-semibold block mb-1">Task Title</label>
                <input 
                  type="text" 
                  placeholder="e.g. Finish the presentation"
                  value={newTaskParams.title} 
                  onChange={(e) => { setNewTaskParams({...newTaskParams, title: e.target.value}); setTaskFormError(''); }}
                  className="w-full border border-border p-2.5 rounded-soft text-sm text-text bg-background focus:outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <label className="text-xs text-text/50 font-semibold block mb-1">Deadline</label>
                <input 
                  type="text" 
                  placeholder="e.g. End of Day, Tomorrow 5PM"
                  value={newTaskParams.deadline} 
                  onChange={(e) => setNewTaskParams({...newTaskParams, deadline: e.target.value})}
                  className="w-full border border-border p-2.5 rounded-soft text-sm text-text bg-background focus:outline-none focus:border-primary/50"
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-xs text-text/50 font-semibold block mb-1">Priority (1-10)</label>
                  <input 
                    type="number" 
                    min="1" max="10"
                    value={newTaskParams.priority} 
                    onChange={(e) => setNewTaskParams({...newTaskParams, priority: parseInt(e.target.value) || 5})}
                    className="w-full border border-border p-2.5 rounded-soft text-sm text-text bg-background focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-text/50 font-semibold block mb-1">Effort (Hours)</label>
                  <input 
                    type="number" 
                    min="1"
                    value={newTaskParams.effortHours} 
                    onChange={(e) => setNewTaskParams({...newTaskParams, effortHours: parseInt(e.target.value) || 1})}
                    className="w-full border border-border p-2.5 rounded-soft text-sm text-text bg-background focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-between items-center">
              <span className="text-urgency text-xs font-semibold">{taskFormError}</span>
              <button 
                onClick={() => {
                  if (!newTaskParams.title) return setTaskFormError('Please enter a task title');
                  if (tasks.some(t => t.title.toLowerCase().trim() === newTaskParams.title.toLowerCase().trim())) {
                    return setTaskFormError('A task with this title already exists');
                  }
                  const newTask = {
                    id: Date.now(),
                    title: newTaskParams.title,
                    deadline: newTaskParams.deadline || 'No deadline',
                    priority: newTaskParams.priority,
                    effortHours: newTaskParams.effortHours,
                    source: 'Manual',
                    actionNeeded: 'Manual task added'
                  };
                  const updatedTasks = [...tasks, newTask];
                  setTasks(updatedTasks);
                  debouncedGeneratePlan(updatedTasks.filter(u => !u.isDone), events);
                  setNewTaskParams({ title: '', deadline: '', priority: 5, effortHours: 1 });
                  setTaskFormError('');
                  setIsAddTaskModalOpen(false);
                  showToast('Task added successfully!');
                }}
                className="bg-primary hover:bg-primary/90 text-white text-sm py-2 px-6 rounded-soft font-semibold transition-colors"
              >
                Add Task
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* EDIT TASK MODAL */}
      <AnimatePresence>
      {editingTask && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-text/45 flex items-center justify-center p-4 z-50">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-highlight border border-border rounded-[12px] max-w-md w-full p-6 shadow-soft-hover space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="text-lg font-semibold text-text">Edit Task</h3>
              <button onClick={() => { setEditingTask(null); setTaskFormError(''); }} className="text-text/40 hover:text-text/70">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text/50 font-semibold block mb-1">Task Title</label>
                <input 
                  type="text" 
                  value={editingTask.title} 
                  onChange={(e) => { setEditingTask({...editingTask, title: e.target.value}); setTaskFormError(''); }}
                  className="w-full border border-border p-2.5 rounded-soft text-sm text-text bg-background focus:outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <label className="text-xs text-text/50 font-semibold block mb-1">Deadline</label>
                <input 
                  type="text" 
                  value={editingTask.deadline} 
                  onChange={(e) => setEditingTask({...editingTask, deadline: e.target.value})}
                  className="w-full border border-border p-2.5 rounded-soft text-sm text-text bg-background focus:outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <label className="text-xs text-text/50 font-semibold block mb-1">Action Needed</label>
                <input 
                  type="text" 
                  value={editingTask.actionNeeded} 
                  onChange={(e) => setEditingTask({...editingTask, actionNeeded: e.target.value})}
                  className="w-full border border-border p-2.5 rounded-soft text-sm text-text bg-background focus:outline-none focus:border-primary/50"
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-xs text-text/50 font-semibold block mb-1">Priority (1-10)</label>
                  <input 
                    type="number" 
                    min="1" max="10"
                    value={editingTask.priority} 
                    onChange={(e) => setEditingTask({...editingTask, priority: parseInt(e.target.value) || 5})}
                    className="w-full border border-border p-2.5 rounded-soft text-sm text-text bg-background focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-text/50 font-semibold block mb-1">Effort (Hours)</label>
                  <input 
                    type="number" 
                    min="1"
                    value={editingTask.effortHours} 
                    onChange={(e) => setEditingTask({...editingTask, effortHours: parseInt(e.target.value) || 1})}
                    className="w-full border border-border p-2.5 rounded-soft text-sm text-text bg-background focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-between items-center">
              <span className="text-urgency text-xs font-semibold">{taskFormError}</span>
              <button 
                onClick={() => {
                  if (!editingTask.title) return setTaskFormError('Please enter a task title');
                  if (tasks.some(t => t.id !== editingTask.id && t.title.toLowerCase().trim() === editingTask.title.toLowerCase().trim())) {
                    return setTaskFormError('A task with this title already exists');
                  }
                  setTasks(prev => {
                    const updatedTasks = prev.map(t => t.id === editingTask.id ? editingTask : t);
                    debouncedGeneratePlan(updatedTasks.filter(u => !u.isDone), events);
                    return updatedTasks;
                  });
                  setEditingTask(null);
                  setTaskFormError('');
                  showToast('Task updated successfully!');
                }}
                className="bg-primary hover:bg-primary/90 text-white text-sm py-2 px-6 rounded-soft font-semibold transition-colors"
              >
                Save Changes
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>


      {/* PANIC MODE MODAL */}
      <AnimatePresence>
      {panicTask && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-text/45 flex items-center justify-center p-4 z-50">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-highlight border border-border rounded-[12px] max-w-lg w-full p-6 shadow-soft-hover space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <div className="flex items-center gap-2 text-urgency">
                <ShieldAlert className="w-5 h-5" />
                <h3 className="text-lg font-semibold text-text">Panic Mode</h3>
              </div>
              <button onClick={() => setPanicTask(null)} className="text-text/40 hover:text-text/70">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <h4 className="font-semibold text-text">{panicTask.title}</h4>
              <p className="text-xs text-text/50">Calculated roadmap response for complete focus execution</p>
            </div>

            <div className="space-y-4 border-l-2 border-urgency/30 pl-4 py-2">
              <div 
                className={`relative cursor-pointer transition-colors p-2 rounded-soft hover:bg-accent/50 ${panicStepsCompleted[1] ? 'opacity-50 line-through' : ''}`}
                onClick={() => setPanicStepsCompleted(p => ({...p, 1: !p[1]}))}
              >
                <div className={`absolute -left-[25px] top-3 w-3 h-3 rounded-full ${panicStepsCompleted[1] ? 'bg-secondary' : 'bg-urgency'}`}></div>
                <div className="text-xs font-semibold text-text/60">Step 1 — Block out distractions</div>
                <p className="text-sm text-text/80">Close all browser tabs unrelated to <strong>{panicTask.title}</strong>. Activate Do Not Disturb mode.</p>
              </div>
              <div 
                className={`relative cursor-pointer transition-colors p-2 rounded-soft hover:bg-accent/50 ${panicStepsCompleted[2] ? 'opacity-50 line-through' : ''}`}
                onClick={() => setPanicStepsCompleted(p => ({...p, 2: !p[2]}))}
              >
                <div className={`absolute -left-[25px] top-3 w-3 h-3 rounded-full ${panicStepsCompleted[2] ? 'bg-secondary' : 'bg-border'}`}></div>
                <div className="text-xs font-semibold text-text/60">Step 2 — Draft the content structure</div>
                <p className="text-sm text-text/80">List the primary milestones for <strong>{panicTask.title}</strong>. Don't worry about wording yet.</p>
              </div>
              <div 
                className={`relative cursor-pointer transition-colors p-2 rounded-soft hover:bg-accent/50 ${panicStepsCompleted[3] ? 'opacity-50 line-through' : ''}`}
                onClick={() => setPanicStepsCompleted(p => ({...p, 3: !p[3]}))}
              >
                <div className={`absolute -left-[25px] top-3 w-3 h-3 rounded-full ${panicStepsCompleted[3] ? 'bg-secondary' : 'bg-border'}`}></div>
                <div className="text-xs font-semibold text-text/60">Step 3 — Execute and Refine</div>
                <p className="text-sm text-text/80">Complete the initial draft of <strong>{panicTask.title}</strong> and output final results.</p>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-3">
              <button 
                onClick={() => setPanicTask(null)} 
                className="border border-border hover:bg-accent text-text/70 text-xs py-2 px-4 rounded-soft font-semibold transition-colors"
              >
                Close
              </button>
              <button 
                onClick={() => {
                  setPomodoroTask(panicTask);
                  setIsPomodoroActive(true);
                  setPanicTask(null);
                }} 
                className="bg-primary hover:bg-[#c96645] text-white text-xs py-2 px-4 rounded-soft font-semibold transition-colors flex items-center gap-1"
              >
                <Clock className="w-3.5 h-3.5" /> Start Pomodoro
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>



      {/* COMMAND PALETTE MODAL */}
      <AnimatePresence>
      {isCommandPaletteOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-text/45 flex items-start justify-center pt-[20vh] px-4 z-[100]" onClick={() => setIsCommandPaletteOpen(false)}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()} className="bg-highlight border border-border rounded-soft max-w-lg w-full shadow-soft-hover overflow-hidden relative">
            <div className="flex items-center border-b border-border px-4 py-3">
              <Search className="w-5 h-5 text-text/40 mr-3" />
              <input
                type="text"
                value={commandSearch}
                onChange={e => setCommandSearch(e.target.value)}
                placeholder="Type a command or search..."
                className="w-full bg-transparent border-none outline-none text-text text-sm font-medium placeholder-text/30"
                autoFocus
              />
              <span className="text-[10px] text-text/40 border border-border rounded px-1.5 py-0.5 ml-2 font-medium">ESC</span>
            </div>
            <div className="p-2 space-y-1 max-h-64 overflow-y-auto">
              <div className="text-[10px] text-text/40 uppercase font-bold tracking-wider px-3 py-2">Quick Actions</div>
              <button onClick={() => { setIsAddTaskModalOpen(true); setIsCommandPaletteOpen(false); }} className="w-full text-left px-3 py-2 rounded-soft hover:bg-accent hover:text-primary transition-colors text-sm text-text flex items-center justify-between group">
                <span className="flex items-center gap-2"><PlusCircle className="w-4 h-4 text-text/40 group-hover:text-primary" /> Add Task</span>
                <span className="text-[10px] text-text/30">A</span>
              </button>
              <button onClick={() => { setActiveSection('plan'); setIsCommandPaletteOpen(false); }} className="w-full text-left px-3 py-2 rounded-soft hover:bg-accent hover:text-primary transition-colors text-sm text-text flex items-center gap-2 group">
                <Calendar className="w-4 h-4 text-text/40 group-hover:text-primary" /> View Schedule
              </button>
              <button onClick={() => { generatePlan(tasks.filter(t => !t.isDone), events); setIsCommandPaletteOpen(false); }} className="w-full text-left px-3 py-2 rounded-soft hover:bg-accent hover:text-primary transition-colors text-sm text-text flex items-center justify-between group">
                <span className="flex items-center gap-2"><RefreshCw className="w-4 h-4 text-text/40 group-hover:text-primary" /> Refresh Plan</span>
                <span className="text-[10px] text-text/30">R</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* DAILY BRIEF MODAL */}
      <AnimatePresence>
      {isDailyBriefOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-text/45 flex items-center justify-center p-4 z-[90]">
          <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-highlight border border-primary/20 rounded-soft max-w-md w-full p-8 shadow-soft-hover relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
            <button 
              onClick={() => setIsDailyBriefOpen(false)} 
              className="absolute top-4 right-4 text-text/40 hover:text-text/70 z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="relative z-10 text-center space-y-4">
              <div className="w-16 h-16 bg-gradient-to-br from-primary to-secondary rounded-full mx-auto flex items-center justify-center text-white shadow-soft">
                <Sun className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-serif text-text">DeadlineGPT Daily Brief</h2>
              <p className="text-sm text-text/80 leading-relaxed">
                {greeting}, {userName || 'Ranja'}. You have a busy day ahead! 
                You currently have <strong>{tasks.filter(t => !t.isDone).length} tasks</strong> remaining and <strong>{emails.filter(e => !hiddenEmails.has(e.id)).length} unread emails</strong> to triage. 
              </p>
              <div className="bg-accent/50 p-4 rounded-soft border border-border text-left mt-4">
                <h4 className="text-sm font-semibold text-text flex items-center gap-2 mb-2"><CheckSquare className="w-4 h-4 text-primary" /> Top Priority Today</h4>
                <p className="text-sm text-text/70 italic">"{tasks.filter(t => !t.isDone)[0]?.title || 'Clear your inbox and plan your week.'}"</p>
              </div>
              <button 
                onClick={() => setIsDailyBriefOpen(false)}
                className="w-full bg-primary hover:bg-[#c96645] text-white py-3 rounded-soft font-semibold transition-colors mt-6 shadow-sm"
              >
                Let's get to work
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* POMODORO TIMER MODAL */}
      <AnimatePresence>
      {pomodoroTask && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-text/45 flex items-center justify-center p-4 z-50">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-highlight border border-border rounded-[12px] max-w-sm w-full p-8 shadow-soft-hover text-center space-y-6 relative">
            <button 
              onClick={() => {
                setIsPomodoroActive(false);
                setPomodoroSeconds(25 * 60);
                setPomodoroTask(null);
              }} 
              className="absolute top-4 right-4 text-text/40 hover:text-text/70"
            >
              <X className="w-5 h-5" />
            </button>
            <div>
              <span className="text-xs text-text/40 font-semibold uppercase tracking-wider block">Focus Session</span>
              <h3 className="text-xl text-text mt-1">{pomodoroTask.title}</h3>
            </div>

            <div className="text-6xl text-text tracking-tighter tabular-nums py-4 relative flex justify-center items-center">
              <svg className="absolute w-48 h-48 -rotate-90 transform" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="4" className="text-border" />
                <circle 
                  cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="4" 
                  className="text-primary transition-all duration-1000 ease-linear"
                  strokeDasharray="283"
                  strokeDashoffset={283 - (283 * (pomodoroSeconds / (25 * 60)))}
                  strokeLinecap="round"
                />
              </svg>
              <span className="z-10">{formatTime(pomodoroSeconds)}</span>
            </div>

            <div className="flex justify-center gap-3">
              <button 
                onClick={() => setIsPomodoroActive(!isPomodoroActive)}
                className={`py-2 px-6 rounded-soft font-semibold text-sm transition-colors ${
                  isPomodoroActive 
                    ? 'bg-accent border border-border text-text/70 hover:bg-border/20' 
                    : 'bg-primary hover:bg-[#c96645] text-white'
                }`}
              >
                {isPomodoroActive ? 'Pause' : 'Start'}
              </button>
              <button 
                onClick={() => {
                  setIsPomodoroActive(false);
                  setPomodoroSeconds(25 * 60);
                }}
                className="border border-border hover:bg-accent text-text/70 py-2 px-6 rounded-soft font-semibold text-sm transition-colors"
              >
                Reset
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
      <AnimatePresence>
      {toast.visible && (
        <motion.div 
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="fixed top-6 right-6 bg-primary text-white px-6 py-3 rounded-soft shadow-soft-hover z-[100] flex items-center gap-3"
        >
        <Check className="w-5 h-5" />
        <span className="font-medium">{toast.message}</span>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

function NavItem({ icon, label, badge, active, onClick }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-soft transition-all duration-200 cursor-pointer text-left ${
        active 
          ? 'bg-highlight text-primary border-l-4 border-primary font-medium shadow-sm' 
          : 'text-text/70 hover:bg-accent hover:text-text border-l-4 border-transparent hover:shadow-sm hover:scale-[1.01] hover:pl-5'
      }`}
    >
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      {badge !== undefined && badge > 0 && (
        <span className="text-[10px] font-bold bg-primary text-white px-2 py-0.5 rounded-full">
          {badge}
        </span>
      )}
    </button>
  );
}
