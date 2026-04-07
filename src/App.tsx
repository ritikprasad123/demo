/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Smile, Frown, Angry, Ghost, Meh, Zap, Loader2, MessageSquare, Info, HelpCircle, AlertCircle, Mic, MicOff, ThumbsUp, ThumbsDown, Settings, Volume2, VolumeX, Sparkles, Target, ShieldAlert, Wind, User, Trash2, X, Download, FileJson, FileText } from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

type Emotion = 'Happy' | 'Sad' | 'Angry' | 'Fearful' | 'Neutral' | 'Surprised' | 'Frustrated' | 'Inspired' | 'Exhausted' | 'Sarcastic' | 'Passive-Aggressive' | 'Mixed' | 'Excited' | 'Anxious' | 'Disappointed' | 'Confused';

type AssistantMode = 'Empathetic' | 'Professional' | 'Brutally Honest' | 'Zen';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  analysis?: {
    emotion: Emotion;
    confidence: number;
    reason: string;
  };
  suggestions?: string[];
  feedback?: 'helpful' | 'unhelpful' | null;
  timestamp: Date;
}

const EMOTION_ICONS: Record<string, any> = {
  Happy: <Smile className="text-yellow-500" />,
  Sad: <Frown className="text-blue-500" />,
  Angry: <Angry className="text-red-500" />,
  Fearful: <Ghost className="text-purple-500" />,
  Neutral: <Meh className="text-gray-500" />,
  Surprised: <Zap className="text-orange-500" />,
  Frustrated: <Angry className="text-orange-600" />,
  Inspired: <Zap className="text-indigo-500" />,
  Exhausted: <Meh className="text-slate-400" />,
  Sarcastic: <Smile className="text-emerald-500" />,
  'Passive-Aggressive': <Angry className="text-rose-400" />,
  Mixed: <MessageSquare className="text-amber-500" />,
  Excited: <Zap className="text-pink-500" />,
  Anxious: <AlertCircle className="text-teal-500" />,
  Disappointed: <Frown className="text-slate-500" />,
  Confused: <HelpCircle className="text-yellow-600" />,
};

const EMOTION_COLORS: Record<string, string> = {
  Happy: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  Sad: 'bg-blue-50 border-blue-200 text-blue-800',
  Angry: 'bg-red-50 border-red-200 text-red-800',
  Fearful: 'bg-purple-50 border-purple-200 text-purple-800',
  Neutral: 'bg-gray-50 border-gray-200 text-gray-800',
  Surprised: 'bg-orange-50 border-orange-200 text-orange-800',
  Frustrated: 'bg-orange-50 border-orange-200 text-orange-800',
  Inspired: 'bg-indigo-50 border-indigo-200 text-indigo-800',
  Exhausted: 'bg-slate-50 border-slate-200 text-slate-800',
  Sarcastic: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  'Passive-Aggressive': 'bg-rose-50 border-rose-200 text-rose-800',
  Mixed: 'bg-amber-50 border-amber-200 text-amber-800',
  Excited: 'bg-pink-50 border-pink-200 text-pink-800',
  Anxious: 'bg-teal-50 border-teal-200 text-teal-800',
  Disappointed: 'bg-slate-100 border-slate-300 text-slate-800',
  Confused: 'bg-yellow-50 border-yellow-300 text-yellow-900',
};

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [assistantMode, setAssistantMode] = useState<AssistantMode>('Empathetic');
  const [learnedInsights, setLearnedInsights] = useState<string[]>([]);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [realtimeEmotion, setRealtimeEmotion] = useState<Emotion | null>(null);
  const [isAnalyzingRealtime, setIsAnalyzingRealtime] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Load data from localStorage on mount
  useEffect(() => {
    const savedMessages = localStorage.getItem('sentiment_messages');
    const savedInsights = localStorage.getItem('sentiment_insights');
    const savedMode = localStorage.getItem('sentiment_mode');
    const savedVoice = localStorage.getItem('sentiment_voice');

    if (savedMessages) {
      try {
        const parsed = JSON.parse(savedMessages);
        // Convert string timestamps back to Date objects
        const formatted = parsed.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        }));
        setMessages(formatted);
      } catch (e) {
        console.error('Failed to parse saved messages', e);
      }
    }
    if (savedInsights) setLearnedInsights(JSON.parse(savedInsights));
    if (savedMode) setAssistantMode(savedMode as AssistantMode);
    if (savedVoice) setIsVoiceEnabled(savedVoice === 'true');
  }, []);

  // Save data to localStorage when it changes
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('sentiment_messages', JSON.stringify(messages));
    }
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('sentiment_insights', JSON.stringify(learnedInsights));
  }, [learnedInsights]);

  useEffect(() => {
    localStorage.setItem('sentiment_mode', assistantMode);
  }, [assistantMode]);

  useEffect(() => {
    localStorage.setItem('sentiment_voice', isVoiceEnabled.toString());
  }, [isVoiceEnabled]);

  // Real-time emotion detection
  useEffect(() => {
    if (!input.trim() || input.length < 3) {
      setRealtimeEmotion(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsAnalyzingRealtime(true);
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Analyze the following text and return ONLY the primary emotion from this list: Happy, Sad, Angry, Fearful, Neutral, Surprised, Frustrated, Inspired, Exhausted, Sarcastic, Passive-Aggressive, Mixed, Excited, Anxious, Disappointed, Confused.\n\nText: "${input}"`,
          config: {
            systemInstruction: "You are a real-time sentiment analyzer. Respond with exactly one word from the provided list.",
          },
        });
        const emotion = response.text.trim() as Emotion;
        if (Object.keys(EMOTION_ICONS).includes(emotion)) {
          setRealtimeEmotion(emotion);
        }
      } catch (error) {
        console.error('Real-time analysis failed:', error);
      } finally {
        setIsAnalyzingRealtime(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join('');
        setInput(transcript);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const speak = (text: string) => {
    if (!isVoiceEnabled) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Adjust voice based on mode
    switch (assistantMode) {
      case 'Zen':
        utterance.rate = 0.8;
        utterance.pitch = 0.9;
        break;
      case 'Brutally Honest':
        utterance.rate = 1.1;
        utterance.pitch = 1.0;
        break;
      case 'Professional':
        utterance.rate = 1.0;
        utterance.pitch = 1.1;
        break;
      default:
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
    }
    
    window.speechSynthesis.speak(utterance);
  };

  const analyzeSentiment = async (text: string, history: ChatMessage[], insights: string[]) => {
    try {
      const historyContext = history.map(m => {
        const feedbackStr = m.feedback ? ` (User rated this as ${m.feedback})` : '';
        return `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}${feedbackStr}`;
      }).join('\n');
      const insightsContext = insights.length > 0 ? `Learned Insights about this User:\n- ${insights.join('\n- ')}` : 'No specific insights learned yet.';
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Current User Input: "${text}"\n\nConversation History:\n${historyContext}\n\n${insightsContext}`,
        config: {
          systemInstruction: `You are a highly advanced Emotional Intelligence (EQ) AI that CONTINUOUSLY LEARNS from every interaction. You are currently operating in "${assistantMode}" mode.

Your core directives:
1. Deep Sentiment Analysis: Detect sarcasm, passive-aggression, hidden cries for help, or complex mixtures of emotions.
2. Contextual Awareness: Use the conversation history and "Learned Insights" to understand the user's unique emotional profile.
3. Nuanced Classification: Classify the primary emotion (Happy, Sad, Angry, Fearful, Neutral, Surprised, Inspired, Exhausted, Sarcastic, Passive-Aggressive, Mixed, Excited, Anxious, Disappointed, Confused).
4. Mode-Specific Persona:
   - Empathetic: Warm, supportive, uses "I" statements, focuses on validation.
   - Professional: Objective, goal-oriented, encouraging but firm, focuses on growth.
   - Brutally Honest: Direct, no sugar-coating, focuses on logic and hard truths.
   - Zen: Calm, philosophical, focuses on mindfulness and the present moment.
5. Continuous Training (SIMULATED): Identify one NEW specific insight about the user's emotional triggers.
6. Follow-up Suggestions: Provide 2-3 short, actionable follow-up prompts or questions that guide the user towards deeper self-reflection or provide targeted support based on the current context.

Output format (strict JSON):
{
  "emotion": "emotion_label",
  "confidence": 0.98,
  "reason": "Linguistic and emotional reasoning.",
  "response": "A context-aware reply matching the ${assistantMode} persona.",
  "newInsight": "A single sentence describing a new thing learned about the user's emotional patterns.",
  "suggestions": ["Prompt 1", "Prompt 2"]
}

Training Examples:
Example 1 (Sarcasm):
User: "Oh great, another meeting. Just what I wanted."
Analysis: { "emotion": "Sarcastic", "confidence": 0.95, "reason": "The use of 'Oh great' followed by a statement that contradicts typical desires for meetings indicates verbal irony.", "response": "I hear you. Meetings can really break up your flow when you're trying to get things done. Is there anything specific about this one that's particularly draining?", "newInsight": "User uses sarcasm to express workplace frustration." }

Example 2 (Passive-Aggressive):
User: "No, it's fine. I'll just do all the work myself like I always do."
Analysis: { "emotion": "Passive-Aggressive", "confidence": 0.92, "reason": "The user says 'it's fine' but immediately follows with a complaint about an unfair workload, indicating indirect hostility.", "response": "It sounds like you're feeling a bit unsupported and overwhelmed with the workload. That's a lot for one person to carry. Would you like to talk about how to address this balance?", "newInsight": "User expresses indirect hostility when feeling unsupported." }`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              emotion: { type: Type.STRING },
              confidence: { type: Type.NUMBER },
              reason: { type: Type.STRING },
              response: { type: Type.STRING },
              newInsight: { type: Type.STRING },
              suggestions: { 
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
            },
            required: ["emotion", "confidence", "reason", "response", "newInsight", "suggestions"],
          },
        },
      });

      const result = JSON.parse(response.text || '{}');
      return result;
    } catch (error) {
      console.error('Sentiment analysis failed:', error);
      return {
        emotion: 'Neutral',
        confidence: 0,
        reason: 'Error analyzing sentiment.',
        response: "I'm here to listen, but I'm having a little trouble processing that right now. Could you tell me more?",
        newInsight: "",
      };
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    const analysis = await analyzeSentiment(input, messages, learnedInsights);

    if (analysis.newInsight) {
      setLearnedInsights(prev => [...prev.slice(-4), analysis.newInsight]); // Keep last 5 insights
    }

    const assistantMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: analysis.response,
      analysis: {
        emotion: analysis.emotion as Emotion,
        confidence: analysis.confidence,
        reason: analysis.reason,
      },
      suggestions: analysis.suggestions || [],
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, assistantMessage]);
    setIsLoading(false);
    speak(assistantMessage.content);
  };

  const handleResetProfile = () => {
    if (confirm('Are you sure you want to reset your emotional profile? This will clear all chat history and learned insights.')) {
      setMessages([]);
      setLearnedInsights([]);
      localStorage.removeItem('sentiment_messages');
      localStorage.removeItem('sentiment_insights');
      setIsProfileOpen(false);
    }
  };

  const handleExportData = (format: 'json' | 'text') => {
    const data = {
      profile: {
        mode: assistantMode,
        learnedInsights,
        messageCount: messages.length,
        exportedAt: new Date().toISOString(),
      },
      history: messages.map(m => ({
        role: m.role,
        content: m.content,
        emotion: m.analysis?.emotion,
        confidence: m.analysis?.confidence,
        reason: m.analysis?.reason,
        feedback: m.feedback,
        timestamp: m.timestamp.toISOString(),
      }))
    };

    let content = '';
    let mimeType = '';
    let fileName = `sentiment_ai_export_${new Date().getTime()}`;

    if (format === 'json') {
      content = JSON.stringify(data, null, 2);
      mimeType = 'application/json';
      fileName += '.json';
    } else {
      content = `SENTIMENT AI EXPORT\n`;
      content += `Exported At: ${data.profile.exportedAt}\n`;
      content += `Assistant Mode: ${data.profile.mode}\n`;
      content += `\nLEARNED INSIGHTS:\n`;
      data.profile.learnedInsights.forEach((insight, i) => {
        content += `- ${insight}\n`;
      });
      content += `\nCHAT HISTORY:\n`;
      content += `------------------------------------------\n`;
      data.history.forEach(m => {
        content += `[${m.timestamp}] ${m.role.toUpperCase()}:\n`;
        content += `${m.content}\n`;
        if (m.emotion) {
          content += `Emotion: ${m.emotion} (${Math.round((m.confidence || 0) * 100)}%)\n`;
          content += `Reason: ${m.reason}\n`;
        }
        if (m.feedback) content += `Feedback: ${m.feedback}\n`;
        content += `------------------------------------------\n`;
      });
      mimeType = 'text/plain';
      fileName += '.txt';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFeedback = (messageId: string, feedback: 'helpful' | 'unhelpful') => {
    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId) {
        const isSameFeedback = msg.feedback === feedback;
        const newFeedback = isSameFeedback ? null : feedback;
        
        // If unhelpful, we could potentially add a learned insight about what didn't work
        if (newFeedback === 'unhelpful' && msg.analysis) {
          setLearnedInsights(prevInsights => [
            ...prevInsights.slice(-4),
            `User found the response to ${msg.analysis?.emotion} emotion unhelpful. Adjust tone.`
          ]);
        }
        
        return { ...msg, feedback: newFeedback };
      }
      return msg;
    }));
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 md:p-8 font-sans">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col h-[85vh] border border-slate-200">
        {/* Header */}
        <header className="bg-white border-b border-slate-100 p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 p-2 rounded-lg">
                <MessageSquare className="text-white w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-slate-900">Sentiment AI v4.0</h1>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  EQ Intelligence: Multi-Mode
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-50 rounded-lg p-1 border border-slate-100">
                <button 
                  onClick={() => handleExportData('json')}
                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-md transition-all"
                  title="Export as JSON"
                >
                  <FileJson size={16} />
                </button>
                <button 
                  onClick={() => handleExportData('text')}
                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-md transition-all"
                  title="Export as Text"
                >
                  <FileText size={16} />
                </button>
              </div>
              <button 
                onClick={() => setIsProfileOpen(true)}
                className={`p-2 rounded-lg transition-all bg-slate-50 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50`}
                title="View Emotional Profile"
              >
                <User size={18} />
              </button>
              <button 
                onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
                className={`p-2 rounded-lg transition-all ${isVoiceEnabled ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-50 text-slate-400'}`}
                title={isVoiceEnabled ? 'Disable Voice Response' : 'Enable Voice Response'}
              >
                {isVoiceEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
              <button 
                onClick={() => setMessages([])}
                className="text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors px-2"
              >
                Clear
              </button>
            </div>
          </div>
          
          {/* Mode Selector */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {(['Empathetic', 'Professional', 'Brutally Honest', 'Zen'] as AssistantMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setAssistantMode(mode)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap border ${
                  assistantMode === mode 
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' 
                    : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
                }`}
              >
                {mode === 'Empathetic' && <Sparkles size={14} />}
                {mode === 'Professional' && <Target size={14} />}
                {mode === 'Brutally Honest' && <ShieldAlert size={14} />}
                {mode === 'Zen' && <Wind size={14} />}
                {mode}
              </button>
            ))}
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-60">
              <div className="bg-white p-4 rounded-full shadow-sm">
                <Smile className="w-12 h-12 text-indigo-400" />
              </div>
              <div className="max-w-xs">
                <h2 className="text-lg font-medium text-slate-700">How are you feeling?</h2>
                <p className="text-sm text-slate-500 mt-2">
                  Share your thoughts, and I'll try to understand your emotions and support you.
                </p>
              </div>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] space-y-2`}>
                  <div
                    className={`p-4 rounded-2xl shadow-sm relative group ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-tr-none'
                        : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'
                    }`}
                  >
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                    
                    {msg.role === 'assistant' && (
                      <div className="absolute -right-12 top-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleFeedback(msg.id, 'helpful')}
                          className={`p-1.5 rounded-lg border transition-all ${msg.feedback === 'helpful' ? 'bg-green-100 border-green-200 text-green-600' : 'bg-white border-slate-100 text-slate-400 hover:text-green-500'}`}
                        >
                          <ThumbsUp size={14} />
                        </button>
                        <button 
                          onClick={() => handleFeedback(msg.id, 'unhelpful')}
                          className={`p-1.5 rounded-lg border transition-all ${msg.feedback === 'unhelpful' ? 'bg-red-100 border-red-200 text-red-600' : 'bg-white border-slate-100 text-slate-400 hover:text-red-500'}`}
                        >
                          <ThumbsDown size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {msg.analysis && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className={`p-3 rounded-xl border text-xs flex flex-col gap-2 ${EMOTION_COLORS[msg.analysis.emotion] || EMOTION_COLORS.Neutral}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-semibold">
                          {EMOTION_ICONS[msg.analysis.emotion] || <Meh size={14} />}
                          <span>{msg.analysis.emotion}</span>
                        </div>
                        <div className="text-[10px] opacity-70">
                          {Math.round(msg.analysis.confidence * 100)}% Confidence
                        </div>
                      </div>
                      <p className="opacity-90 italic">"{msg.analysis.reason}"</p>
                    </motion.div>
                  )}

                  {msg.role === 'assistant' && msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {msg.suggestions.map((suggestion, i) => (
                        <button
                          key={i}
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="text-[10px] bg-white border border-slate-200 text-indigo-600 px-2 py-1 rounded-full hover:bg-indigo-50 hover:border-indigo-200 transition-all shadow-sm"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                  
                  <div className={`text-[10px] text-slate-400 px-1 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="bg-white p-4 rounded-2xl rounded-tl-none border border-slate-100 shadow-sm flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                <span className="text-xs text-slate-500 font-medium italic">Analyzing emotions...</span>
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-6 bg-white border-t border-slate-100">
          <div className="relative flex items-center gap-2">
            <button
              onClick={toggleListening}
              className={`p-3 rounded-xl transition-all ${
                isListening
                  ? 'bg-red-100 text-red-600 animate-pulse'
                  : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
              }`}
              title={isListening ? 'Stop Listening' : 'Start Voice Input'}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            <div className="relative flex-1 flex items-center">
              <div className="absolute left-3 z-10 flex items-center pointer-events-none">
                <AnimatePresence mode="wait">
                  {isAnalyzingRealtime ? (
                    <motion.div
                      key="loader"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                    >
                      <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                    </motion.div>
                  ) : realtimeEmotion ? (
                    <motion.div
                      key="emotion"
                      initial={{ opacity: 0, scale: 0.5, rotate: -20 }}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      title={`Detected: ${realtimeEmotion}`}
                    >
                      {EMOTION_ICONS[realtimeEmotion]}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={isListening ? "Listening..." : "Type how you're feeling..."}
                className={`w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all ${realtimeEmotion || isAnalyzingRealtime ? 'pl-10' : 'pl-4'}`}
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className={`absolute right-2 p-2 rounded-lg transition-all ${
                  !input.trim() || isLoading
                    ? 'text-slate-300'
                    : 'text-indigo-600 hover:bg-indigo-50'
                }`}
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-400">
            <Info size={12} />
            <span>AI analyzes your sentiment to provide empathetic support.</span>
          </div>
        </div>
      </div>

      {/* Profile Modal */}
      <AnimatePresence>
        {isProfileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setIsProfileOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-indigo-600 text-white">
                <div className="flex items-center gap-3">
                  <User className="w-6 h-6" />
                  <h2 className="text-xl font-semibold">Emotional Profile</h2>
                </div>
                <button 
                  onClick={() => setIsProfileOpen(false)}
                  className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                    Learned Emotional Patterns
                  </h3>
                  {learnedInsights.length > 0 ? (
                    <div className="space-y-2">
                      {learnedInsights.map((insight, i) => (
                        <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-600 leading-relaxed">
                          {insight}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic p-4 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      No patterns identified yet. Keep chatting to help the AI learn about you.
                    </p>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="text-sm font-medium text-slate-900">Session Statistics</h4>
                      <p className="text-[10px] text-slate-500">Overview of your current data</p>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-indigo-600">{messages.length}</div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Messages</div>
                    </div>
                  </div>
                  
                  <button
                    onClick={handleResetProfile}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100 transition-colors border border-red-100"
                  >
                    <Trash2 size={16} />
                    Reset Emotional Profile
                  </button>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
                <p className="text-[10px] text-slate-400">
                  Your data is stored locally in your browser for privacy.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
