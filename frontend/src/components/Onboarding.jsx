import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, Edit3, Mail, Calendar, Image as ImageIcon, UploadCloud, X, Loader2 } from 'lucide-react';

export default function Onboarding() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('emails');
  const [isManualExpanded, setIsManualExpanded] = useState(false);
  
  const [emailText, setEmailText] = useState('');
  const [scheduleText, setScheduleText] = useState('');
  
  const [thumbnails, setThumbnails] = useState([]);
  const [files, setFiles] = useState([]);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const newFiles = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          newFiles.push(items[i].getAsFile());
        }
      }
      if (newFiles.length > 0) {
        if (!isManualExpanded) setIsManualExpanded(true);
        setActiveTab('screenshots');
        setFiles(prev => [...prev, ...newFiles]);
        setThumbnails(prev => [...prev, ...newFiles.map(f => URL.createObjectURL(f))]);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isManualExpanded]);

  const handleGoogleConnect = () => {
    window.location.href = '/auth/google';
  };

  const handleFileUpload = (e) => {
    const uploadedFiles = Array.from(e.target.files);
    setFiles(prev => [...prev, ...uploadedFiles]);
    setThumbnails(prev => [...prev, ...uploadedFiles.map(f => URL.createObjectURL(f))]);
  };

  const handleRemoveFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setThumbnails(prev => prev.filter((_, i) => i !== index));
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    let combinedData = { tasks: [], events: [], emailsNeedingReply: [] };

    try {
      if (files.length > 0) {
        const formData = new FormData();
        files.forEach(f => formData.append('screenshots', f));
        
        const res = await fetch('/api/manual-screenshot', {
          method: 'POST',
          body: formData
        });
        if (res.ok) {
          const data = await res.json();
          if (data.tasks) combinedData.tasks.push(...data.tasks);
          if (data.events) combinedData.events.push(...data.events);
          if (data.emailsNeedingReply) combinedData.emailsNeedingReply.push(...data.emailsNeedingReply);
        }
      }

      const fullText = [emailText, scheduleText].filter(Boolean).join('\n\n');
      if (fullText.trim()) {
        const res = await fetch('/api/manual-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: fullText })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.tasks) combinedData.tasks.push(...data.tasks);
          if (data.events) combinedData.events.push(...data.events);
          if (data.emailsNeedingReply) combinedData.emailsNeedingReply.push(...data.emailsNeedingReply);
        }
      }

      localStorage.setItem('manualData', JSON.stringify(combinedData));
      navigate('/dashboard');
    } catch (err) {
      console.error('Error analyzing manual data:', err);
      navigate('/dashboard');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 sm:p-12">
      <div className="max-w-4xl w-full text-center mb-12">
        <h1 className="text-5xl font-serif text-text mb-4">DeadlineGPT</h1>
        <p className="text-xl text-text/80 font-sans">
          Your AI that doesn't just remind you — it acts for you.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-8 w-full max-w-4xl">
        <div className="flex-1 bg-highlight border border-primary/20 rounded-[12px] p-8 flex flex-col items-center text-center shadow-soft hover:shadow-soft-hover transition-shadow duration-300">
          <div className="w-16 h-16 bg-highlight rounded-full flex items-center justify-center mb-6 shadow-sm">
            <Link2 className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-serif mb-3 text-text">Connect Google Automatically</h2>
          <p className="text-text/70 mb-8 flex-grow">
            Let the agent read your Gmail + Calendar directly.
          </p>
          <button 
            onClick={handleGoogleConnect}
            className="w-full bg-highlight border-2 border-primary text-primary hover:bg-primary/10 py-3 px-6 rounded-soft font-medium transition-colors duration-200"
          >
            Connect with Google
          </button>
        </div>

        <div className="flex-1 bg-highlight border border-primary/20 rounded-[12px] p-8 flex flex-col items-center text-center shadow-soft hover:shadow-soft-hover transition-shadow duration-300">
          <div className="w-16 h-16 bg-highlight rounded-full flex items-center justify-center mb-6 shadow-sm">
            <Edit3 className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-serif mb-3">Enter Manually</h2>
          <p className="text-text/70 mb-8 flex-grow">
            Paste text or upload screenshots — no login needed.
          </p>
          <button 
            onClick={() => setIsManualExpanded(!isManualExpanded)}
            className="w-full bg-highlight border-2 border-primary text-primary hover:bg-highlight py-3 px-6 rounded-soft font-medium transition-colors duration-200"
          >
            {isManualExpanded ? 'Hide Input Options' : 'Show Input Options'}
          </button>
        </div>
      </div>

      {isManualExpanded && (
        <div className="w-full max-w-4xl mt-8 bg-highlight border border-border rounded-[12px] overflow-hidden shadow-soft animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex border-b border-border bg-accent">
            <button 
              onClick={() => setActiveTab('emails')}
              className={`flex-1 py-4 flex items-center justify-center gap-2 font-medium transition-colors ${activeTab === 'emails' ? 'bg-highlight text-primary border-t-2 border-t-primary' : 'text-text/60 hover:text-text'}`}
            >
              <Mail className="w-5 h-5" /> Paste Emails
            </button>
            <button 
              onClick={() => setActiveTab('schedule')}
              className={`flex-1 py-4 flex items-center justify-center gap-2 font-medium transition-colors ${activeTab === 'schedule' ? 'bg-highlight text-primary border-t-2 border-t-primary' : 'text-text/60 hover:text-text'}`}
            >
              <Calendar className="w-5 h-5" /> Paste Schedule
            </button>
            <button 
              onClick={() => setActiveTab('screenshots')}
              className={`flex-1 py-4 flex items-center justify-center gap-2 font-medium transition-colors ${activeTab === 'screenshots' ? 'bg-highlight text-primary border-t-2 border-t-primary' : 'text-text/60 hover:text-text'}`}
            >
              <ImageIcon className="w-5 h-5" /> Upload Screenshots
            </button>
          </div>
          
          <div className="p-6">
            {activeTab === 'emails' && (
              <div className="flex flex-col h-full relative">
                <textarea 
                  value={emailText}
                  onChange={(e) => setEmailText(e.target.value)}
                  className="w-full h-48 p-4 bg-accent/30 border border-border rounded-soft focus:outline-none focus:border-primary/50 resize-none text-text"
                  placeholder="Paste any emails you've received that need action..."
                ></textarea>
                <span className="absolute bottom-4 right-4 text-xs text-text/40">{emailText.length} chars</span>
              </div>
            )}
            
            {activeTab === 'schedule' && (
              <div className="flex flex-col h-full relative">
                <textarea 
                  value={scheduleText}
                  onChange={(e) => setScheduleText(e.target.value)}
                  className="w-full h-48 p-4 bg-accent/30 border border-border rounded-soft focus:outline-none focus:border-primary/50 resize-none text-text"
                  placeholder="Paste your calendar or write your week..."
                ></textarea>
                <span className="absolute bottom-4 right-4 text-xs text-text/40">{scheduleText.length} chars</span>
              </div>
            )}
            
            {activeTab === 'screenshots' && (
              <div className="flex flex-col gap-4">
                <label className="w-full h-32 border-2 border-dashed border-border hover:border-primary/50 bg-accent/20 flex flex-col items-center justify-center rounded-soft cursor-pointer transition-colors group">
                  <UploadCloud className="w-8 h-8 text-primary mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-text/70">Drop screenshots here or click to browse</span>
                  <span className="text-xs text-text/40 mt-1">Accepts PNG, JPG, WEBP</span>
                  <input type="file" multiple className="hidden" onChange={handleFileUpload} accept="image/png, image/jpeg, image/webp" />
                </label>
                
                {thumbnails.length > 0 && (
                  <div className="flex gap-4 p-4 bg-highlight rounded-soft overflow-x-auto">
                    {thumbnails.map((src, i) => (
                      <div key={i} className="relative shrink-0 group">
                        <img src={src} className="w-24 h-24 object-cover rounded-md border border-border" alt="upload preview" />
                        <button 
                          onClick={() => handleRemoveFile(i)}
                          className="absolute -top-2 -right-2 bg-highlight rounded-full p-1 shadow-sm border border-border text-text/50 hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="w-full max-w-4xl mt-12 flex flex-col items-center">
        <button 
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className="w-full bg-urgency hover:bg-[#b04d30] text-white py-4 rounded-[12px] text-xl font-serif shadow-soft hover:shadow-soft-hover transition-all duration-300 transform hover:-translate-y-0.5 disabled:opacity-70 disabled:hover:translate-y-0 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              Analyzing Data...
            </>
          ) : (
            'Analyze Everything'
          )}
        </button>
        <button 
          onClick={() => setIsManualExpanded(true)}
          className="mt-6 text-sm text-text/60 hover:text-primary transition-colors underline underline-offset-4"
        >
          Already connected Google but want to add more context? Upload screenshots or paste text to supplement your data →
        </button>
      </div>
    </div>
  );
}
