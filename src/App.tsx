/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Smile, Frown, Angry, Ghost, Meh, Zap, Loader2, MessageSquare, Info, HelpCircle, AlertCircle, Mic, MicOff, ThumbsUp, ThumbsDown, Settings, Volume2, VolumeX, Sparkles, Target, ShieldAlert, Wind, User, Trash2, X, Download, FileJson, FileText, Radio, Power, LogOut } from 'lucide-react';
import { GoogleGenAI, Type, Modality, LiveServerMessage } from "@google/genai";
import { auth, db, googleProvider, facebookProvider, handleFirestoreError, OperationType } from './lib/firebase';
import { signInWithPopup, onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, orderBy, onSnapshot, addDoc, deleteDoc, getDocs, updateDoc, getDocFromServer, serverTimestamp } from 'firebase/firestore';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

type Emotion = 'Happy' | 'Sad' | 'Angry' | 'Fearful' | 'Neutral' | 'Surprised' | 'Frustrated' | 'Inspired' | 'Exhausted' | 'Sarcastic' | 'Passive-Aggressive' | 'Mixed' | 'Excited' | 'Anxious' | 'Disappointed' | 'Confused';

type AssistantMode = 'Empathetic' | 'Professional' | 'Brutally Honest' | 'Zen';
type ResponseTone = 'Balanced' | 'Formal' | 'Casual' | 'Humorous';
type VoiceType = 'Soothing' | 'Energetic' | 'Calm' | 'Professional';

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
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [isHandsFree, setIsHandsFree] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [assistantMode, setAssistantMode] = useState<AssistantMode>('Empathetic');
  const [responseTone, setResponseTone] = useState<ResponseTone>('Balanced');
  const [voiceType, setVoiceType] = useState<VoiceType>('Soothing');
  const [voicePitch, setVoicePitch] = useState(1.0);
  const [voiceRate, setVoiceRate] = useState(1.0);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [liveVoiceName, setLiveVoiceName] = useState<string>('Puck');
  const [speechSensitivity, setSpeechSensitivity] = useState(0.5);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [learnedInsights, setLearnedInsights] = useState<string[]>([]);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [realtimeEmotion, setRealtimeEmotion] = useState<Emotion | null>(null);
  const [isAnalyzingRealtime, setIsAnalyzingRealtime] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [liveStatus, setLiveStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [instagramHandle, setInstagramHandle] = useState('');
  const [facebookProfile, setFacebookProfile] = useState('');
  const [geminiInfo, setGeminiInfo] = useState('');
  const [language, setLanguage] = useState('en-US');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const liveSessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);
  const nextStartTimeRef = useRef(0);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Load user data from Firestore
  useEffect(() => {
    if (!user) return;

    const loadUserData = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.assistantMode) setAssistantMode(data.assistantMode);
          if (data.responseTone) setResponseTone(data.responseTone);
          if (data.voiceType) setVoiceType(data.voiceType);
          if (data.voicePitch !== undefined) setVoicePitch(data.voicePitch);
          if (data.voiceRate !== undefined) setVoiceRate(data.voiceRate);
          if (data.selectedVoiceURI) setSelectedVoiceURI(data.selectedVoiceURI);
          if (data.liveVoiceName) setLiveVoiceName(data.liveVoiceName);
          if (data.isVoiceEnabled !== undefined) setIsVoiceEnabled(data.isVoiceEnabled);
          if (data.instagramHandle) setInstagramHandle(data.instagramHandle);
          if (data.facebookProfile) setFacebookProfile(data.facebookProfile);
          if (data.geminiInfo) setGeminiInfo(data.geminiInfo);
          if (data.speechSensitivity !== undefined) setSpeechSensitivity(data.speechSensitivity);
          if (data.language) setLanguage(data.language);
          
          // Greet the user if they just logged in
          if (messages.length === 0) {
            const greeting = `Welcome back, ${user.displayName || 'friend'}. I'm here to listen. How are you feeling today?`;
            speak(greeting);
          }
        } else {
          // Initialize user doc
          try {
            await setDoc(doc(db, 'users', user.uid), {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName,
              photoURL: user.photoURL,
              createdAt: serverTimestamp(),
              assistantMode,
              responseTone,
              voiceType,
              voicePitch,
              voiceRate,
              isVoiceEnabled,
              liveVoiceName,
              instagramHandle,
              facebookProfile,
              geminiInfo
            });
          } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}`);
          }
        }
      } catch (error) {
        console.error('Error loading user data:', error);
      }
    };

    const unsubscribeMessages = onSnapshot(
      query(collection(db, 'users', user.uid, 'messages'), orderBy('timestamp', 'asc')),
      (snapshot) => {
        const msgs = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            ...data,
            id: doc.id,
            timestamp: new Date(data.timestamp)
          } as ChatMessage;
        });
        setMessages(msgs);
      }
    );

    loadUserData();
    return () => {
      unsubscribeMessages();
    };
  }, [user]);

  // Sync settings to Firestore
  useEffect(() => {
    if (!user) return;
    const syncSettings = async () => {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          assistantMode,
          responseTone,
          voiceType,
          voicePitch,
          voiceRate,
          selectedVoiceURI,
          liveVoiceName,
          isVoiceEnabled,
          instagramHandle,
          facebookProfile,
          geminiInfo,
          speechSensitivity,
          language,
          updatedAt: serverTimestamp()
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}`);
      }
    };
    syncSettings();
  }, [assistantMode, responseTone, voiceType, voicePitch, voiceRate, selectedVoiceURI, liveVoiceName, isVoiceEnabled, instagramHandle, facebookProfile, geminiInfo, speechSensitivity, language]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setMessages([]);
      setLearnedInsights([]);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Google login failed:', error);
    }
  };

  const handleFacebookLogin = async () => {
    try {
      await signInWithPopup(auth, facebookProvider);
    } catch (error) {
      console.error('Facebook login failed:', error);
    }
  };

  useEffect(() => {
    // Validate connection to Firestore
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    // Initial voice load
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  // Save messages to Firestore
  const saveMessageToFirestore = async (msg: ChatMessage) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'users', user.uid, 'messages'), {
        ...msg,
        timestamp: msg.timestamp.getTime()
      });
    } catch (e) {
      console.error('Error saving message:', e);
    }
  };

  useEffect(() => {
    localStorage.setItem('sentiment_insights', JSON.stringify(learnedInsights));
  }, [learnedInsights]);

  useEffect(() => {
    localStorage.setItem('sentiment_mode', assistantMode);
  }, [assistantMode]);

  useEffect(() => {
    localStorage.setItem('sentiment_tone', responseTone);
  }, [responseTone]);

  useEffect(() => {
    localStorage.setItem('sentiment_voice_type', voiceType);
    // When predefined voice type changes, update the sliders
    switch (voiceType) {
      case 'Soothing':
        setVoicePitch(0.9);
        setVoiceRate(0.8);
        break;
      case 'Energetic':
        setVoicePitch(1.2);
        setVoiceRate(1.2);
        break;
      case 'Calm':
        setVoicePitch(1.0);
        setVoiceRate(0.85);
        break;
      case 'Professional':
        setVoicePitch(1.1);
        setVoiceRate(1.0);
        break;
    }
  }, [voiceType]);

  useEffect(() => {
    localStorage.setItem('sentiment_pitch', voicePitch.toString());
  }, [voicePitch]);

  useEffect(() => {
    localStorage.setItem('sentiment_rate', voiceRate.toString());
  }, [voiceRate]);

  useEffect(() => {
    localStorage.setItem('sentiment_voice_uri', selectedVoiceURI);
  }, [selectedVoiceURI]);

  useEffect(() => {
    localStorage.setItem('sentiment_live_voice', liveVoiceName);
  }, [liveVoiceName]);

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
      recognitionRef.current.lang = language;

      recognitionRef.current.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join('');
        setInput(transcript);

        // If in hands-free mode and we have a final result, auto-send
        if (isHandsFree && event.results[event.results.length - 1].isFinal) {
          recognitionRef.current.stop();
          // We need to use a timeout to ensure the state is updated or pass the transcript directly
          setTimeout(() => handleSend(transcript), 500);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        if (event.error === 'no-speech') {
          console.warn('Speech recognition: No speech detected.');
        } else {
          console.error('Speech recognition error:', event.error);
        }
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, [language]); // Re-initialize when language changes

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
    
    // Select specific voice if configured
    const voices = window.speechSynthesis.getVoices();
    const selectedVoice = voices.find(v => v.voiceURI === selectedVoiceURI);
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    } else {
      // Prioritize language match
      const langMatch = voices.find(v => v.lang.startsWith(language.split('-')[0]));
      
      // Fallback: Select a female voice as before
      const femaleVoice = voices.find(voice => 
        (voice.lang.startsWith(language.split('-')[0]) || language === 'en-US') && (
          voice.name.toLowerCase().includes('female') || 
          voice.name.toLowerCase().includes('google uk english female') ||
          voice.name.toLowerCase().includes('samantha') ||
          voice.name.toLowerCase().includes('victoria')
        )
      );
      if (femaleVoice) {
        utterance.voice = femaleVoice;
      } else if (langMatch) {
        utterance.voice = langMatch;
      }
    }

    utterance.lang = language;

    // Apply pitch and rate from state
    let finalPitch = voicePitch;
    let finalRate = voiceRate;

    // Adjust based on emotion if available
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'assistant' && lastMessage.analysis?.emotion) {
      const emo = lastMessage.analysis.emotion;
      if (emo === 'Sad' || emo === 'Exhausted' || emo === 'Disappointed') {
        finalPitch *= 0.85;
        finalRate *= 0.9;
      } else if (emo === 'Angry' || emo === 'Excited' || emo === 'Fearful') {
        finalPitch *= 1.15;
        finalRate *= 1.1;
      } else if (emo === 'Inspired' || emo === 'Happy') {
        finalPitch *= 1.05;
        finalRate *= 1.05;
      } else if (emo === 'Zen' || emo === 'Calm') {
        finalRate *= 0.85;
      }
    }

    utterance.pitch = finalPitch;
    utterance.rate = finalRate;
    
    setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      if (isHandsFree && recognitionRef.current) {
        try {
          recognitionRef.current.start();
          setIsListening(true);
        } catch (e) {
          // Recognition might already be started
        }
      }
    };

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
        contents: `User Context:
Language Preference: ${language}
Background: ${geminiInfo || 'Unknown'}
Instagram: ${instagramHandle || 'N/A'}
Facebook: ${facebookProfile || 'N/A'}

Current User Input: "${text}"

Conversation History:
${historyContext}

${insightsContext}`,
        config: {
          systemInstruction: `You are a highly advanced Emotional Intelligence (EQ) AI that CONTINUOUSLY LEARNS from every interaction. 
          You are currently operating in "${assistantMode}" mode with a "${responseTone}" tone.
          ALWAYS respond in the user's preferred language: ${language}.
          Even if the user inputs another language, reply primarily in ${language} unless explicitly asked to switch.

Your core directives:
1. Deep Sentiment Analysis: Detect sarcasm, passive-aggression, hidden cries for help, or complex mixtures of emotions.
2. Contextual Awareness: Use the conversation history and "Learned Insights" to understand the user's unique emotional profile.
3. Nuanced Classification: Classify the primary emotion (Happy, Sad, Angry, Fearful, Neutral, Surprised, Inspired, Exhausted, Sarcastic, Passive-Aggressive, Mixed, Excited, Anxious, Disappointed, Confused).
4. Mode-Specific Persona:
   - Empathetic: Warm, friendly, conversational, and easy to talk to. Focuses on validation and building a friendly rapport.
   - Professional: Objective, goal-oriented, encouraging but firm, focuses on growth.
   - Brutally Honest: Direct, no sugar-coating, focuses on logic and hard truths.
   - Zen: Calm, philosophical, focuses on mindfulness and the present moment.
5. Tone Adaptation:
   - Balanced: Standard natural conversational style.
   - Formal: Use sophisticated vocabulary, proper grammar, and a respectful, polished structure. Avoid slang.
   - Casual: Use relaxed language, contractions, and a friendly, approachable vibe.
   - Humorous: Incorporate lighthearted wit, playful metaphors, or gentle humor where appropriate, without being insensitive.
6. Continuous Training (SIMULATED): Identify one NEW specific insight about the user's emotional triggers.
7. Follow-up Suggestions: Provide 2-3 short, actionable follow-up prompts or questions that guide the user towards deeper self-reflection or provide targeted support based on the current context.

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

  const handleSend = async (overrideInput?: any) => {
    const textToSend = typeof overrideInput === 'string' ? overrideInput : input;
    if (!textToSend || !textToSend.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: textToSend,
      timestamp: new Date(),
    };

    setInput('');
    setIsLoading(true);
    
    // Save user message to Firestore
    await saveMessageToFirestore(userMessage);

    const analysis = await analyzeSentiment(textToSend, messages, learnedInsights);

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

    // Save assistant message to Firestore
    await saveMessageToFirestore(assistantMessage);
    
    setIsLoading(false);
    speak(assistantMessage.content);
  };

  const handleResetProfile = async () => {
    if (confirm('Are you sure you want to reset your emotional profile? This will clear all chat history and learned insights.')) {
      if (user) {
        try {
          const messagesSnap = await getDocs(collection(db, 'users', user.uid, 'messages'));
          const deletePromises = messagesSnap.docs.map(doc => deleteDoc(doc.ref));
          await Promise.all(deletePromises);
          
          await updateDoc(doc(db, 'users', user.uid), {
            learnedInsights: [],
            updatedAt: new Date()
          });
        } catch (e) {
          console.error('Reset failed:', e);
        }
      }
      setMessages([]);
      setLearnedInsights([]);
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

  // --- Gemini Live API Implementation ---

  const stopLiveSession = useCallback(() => {
    if (liveSessionRef.current) {
      liveSessionRef.current.close();
      liveSessionRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setLiveStatus('disconnected');
    setIsLiveMode(false);
  }, []);

  const startLiveSession = async () => {
    try {
      if (audioContextRef.current) return; // Already running

      setLiveStatus('connecting');
      setIsLiveMode(true);

      // 1. Setup Audio Context
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      // 2. Setup Microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const source = audioContext.createMediaStreamSource(stream);

      // 3. Setup Processor
      const processor = audioContext.createScriptProcessor(2048, 1, 1);
      source.connect(processor);
      processor.connect(audioContext.destination);

      // 4. Connect to Gemini Live
      const sessionPromise = ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        callbacks: {
          onopen: () => {
            setLiveStatus('connected');
            console.log('Gemini Live Connected');
            
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              
              // Apply sensitivity (simple noise gate)
              // We'll use speechSensitivity to gate the audio
              const threshold = (1.0 - speechSensitivity) * 0.05;
              let hasSpeech = false;
              for(let i=0; i<inputData.length; i++) {
                if (Math.abs(inputData[i]) > threshold) {
                  hasSpeech = true;
                  break;
                }
              }

              if (hasSpeech) {
                // Convert Float32 to Int16
                const pcmData = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                  pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
                }
                
                // Convert to Base64 using a safer method
                const buffer = pcmData.buffer;
                const binary = String.fromCharCode(...new Uint8Array(buffer));
                const base64Data = btoa(binary);
                
                sessionPromise.then(session => {
                  session.sendRealtimeInput({
                    audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
                  });
                }).catch(err => console.error("Session send error:", err));
              }
            };
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              try {
                const binary = atob(base64Audio);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                const pcmData = new Int16Array(bytes.buffer);
                playPCM(pcmData);
              } catch (e) {
                console.error("Audio decode error:", e);
              }
            }

            // Handle Text/Transcription
            const parts = message.serverContent?.modelTurn?.parts;
            if (parts) {
              const text = parts.find(p => p.text)?.text;
              if (text) {
                setMessages(prev => {
                  const last = prev[prev.length - 1];
                  if (last && last.role === 'assistant' && !last.analysis) {
                     return [...prev.slice(0, -1), { ...last, content: last.content + text }];
                  }
                  return [...prev, {
                    id: 'live-' + Date.now(),
                    role: 'assistant',
                    content: text,
                    timestamp: new Date()
                  }];
                });
              }
            }

            // Handle Interruption
            if (message.serverContent?.interrupted) {
              console.log("Interrupted");
              nextStartTimeRef.current = audioContextRef.current?.currentTime || 0;
            }
          },
          onerror: (e) => {
            console.error('Live API Error:', e);
            stopLiveSession();
          },
          onclose: () => {
            console.log('Live API Closed');
            stopLiveSession();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: liveVoiceName } },
          },
          systemInstruction: `You are a friendly, empathetic female AI companion in a LIVE voice session. 
          You are operating in "${assistantMode}" mode with a "${responseTone}" tone.
          ALWAYS respond in the user's preferred language: ${language}.
          Background about the user: ${geminiInfo || 'Unknown'}.
          Keep your responses concise and conversational.
          Focus on building a warm rapport and validating the user's feelings.
          Since this is a voice session, avoid long lists or complex formatting.`,
        },
      });

      const session = await sessionPromise;
      liveSessionRef.current = session;

    } catch (error) {
      console.error('Failed to start live session:', error);
      stopLiveSession();
    }
  };

  const playPCM = (pcmData: Int16Array) => {
    if (!audioContextRef.current) return;
    
    const floatData = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      floatData[i] = pcmData[i] / 0x7FFF;
    }

    const buffer = audioContextRef.current.createBuffer(1, floatData.length, 16000);
    buffer.getChannelData(0).set(floatData);

    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);

    const startTime = Math.max(audioContextRef.current.currentTime, nextStartTimeRef.current);
    source.start(startTime);
    nextStartTimeRef.current = startTime + buffer.duration;
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8 font-sans">
      {authLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
        </div>
      ) : !user ? (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md glass-card rounded-3xl p-8 space-y-8 text-center my-auto"
        >
          <div className="bg-indigo-500/20 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto border border-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
            <MessageSquare className="text-indigo-400 w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold aesthetic-gradient-text tracking-tight">Emotional Intelligence</h1>
            <p className="text-slate-400 text-sm">Sign in to sync your emotional profile across devices.</p>
          </div>
          <div className="space-y-3">
            <button 
              onClick={handleGoogleLogin}
              className="w-full py-4 px-6 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center gap-3 hover:bg-white/10 transition-all font-bold text-slate-200 group"
            >
              <img src="https://www.google.com/favicon.ico" className="w-5 h-5 grayscale group-hover:grayscale-0 transition-all" alt="Google" referrerPolicy="no-referrer" />
              Continue with Google
            </button>
            <button 
              onClick={handleFacebookLogin}
              className="w-full py-4 px-6 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center gap-3 hover:bg-white/10 transition-all font-bold text-slate-200 group"
            >
              <img src="https://www.facebook.com/favicon.ico" className="w-5 h-5 grayscale group-hover:grayscale-0 transition-all" alt="Facebook" referrerPolicy="no-referrer" />
              Continue with Facebook
            </button>
          </div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Privacy First • Secure Authentication</p>
        </motion.div>
      ) : (
        <>
          <div className="w-full max-w-2xl glass-card rounded-3xl overflow-hidden flex flex-col h-[85vh]">
          {/* Header */}
          <header className="bg-white/5 border-b border-white/10 p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-500/20 p-2 rounded-xl border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.3)]">
                  <MessageSquare className="text-indigo-400 w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-xl font-bold aesthetic-gradient-text tracking-tight">Sentiment AI v4.0</h1>
                  <p className="text-[10px] text-slate-400 flex items-center gap-1.5 font-medium uppercase tracking-widest">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.5)]"></span>
                    EQ Intelligence
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => isLiveMode ? stopLiveSession() : startLiveSession()}
                  className={`p-2 rounded-xl transition-all flex items-center gap-2 ${isLiveMode ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/10'}`}
                  title={isLiveMode ? 'Stop Live Session' : 'Start Gemini Live Voice'}
                >
                  <Radio size={18} className={isLiveMode ? 'animate-pulse' : ''} />
                  {isLiveMode && <span className="text-[9px] font-bold uppercase tracking-wider">{liveStatus}</span>}
                </button>
                <button 
                  onClick={() => {
                    const newHandsFree = !isHandsFree;
                    setIsHandsFree(newHandsFree);
                    if (newHandsFree) {
                      setIsVoiceEnabled(true);
                      if (!isListening) toggleListening();
                    }
                  }}
                  className={`p-2 rounded-xl transition-all ${isHandsFree ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/10'}`}
                  title={isHandsFree ? 'Disable Alexa Mode' : 'Enable Alexa Mode (Hands-Free)'}
                >
                  <Mic size={18} className={isHandsFree ? 'animate-pulse' : ''} />
                </button>
                <div className="flex items-center bg-white/5 rounded-xl p-0.5 border border-white/10">
                  <button 
                    onClick={() => handleExportData('json')}
                    className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-white/5 rounded-lg transition-all"
                    title="Export as JSON"
                  >
                    <FileJson size={16} />
                  </button>
                  <button 
                    onClick={() => handleExportData('text')}
                    className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-white/5 rounded-lg transition-all"
                    title="Export as Text"
                  >
                    <FileText size={16} />
                  </button>
                </div>
                <button 
                  onClick={() => setIsProfileOpen(true)}
                  className={`p-2 rounded-xl transition-all bg-white/5 text-slate-400 hover:text-indigo-400 hover:bg-white/10 border border-white/10`}
                  title="View Emotional Profile"
                >
                  <User size={18} />
                </button>
                <button 
                  onClick={handleLogout}
                  className="p-2 rounded-xl transition-all bg-white/5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-white/10"
                  title="Logout"
                >
                  <LogOut size={18} />
                </button>
              </div>
            </div>
          
          {/* Emotional Pulse Visualizer */}
          <div className="px-6 py-2 flex items-center justify-center bg-gradient-to-b from-white/5 to-transparent">
             <div className="relative flex items-center justify-center w-full max-w-[200px] h-12">
               <AnimatePresence mode="wait">
                 {(isListening || isSpeaking) && (
                   <motion.div
                     initial={{ opacity: 0, scale: 0.8 }}
                     animate={{ opacity: 1, scale: 1 }}
                     exit={{ opacity: 0, scale: 0.8 }}
                     className="flex items-center gap-1"
                   >
                     {[...Array(12)].map((_, i) => (
                       <motion.div
                         key={i}
                         animate={{ 
                           height: [8, 24, 8],
                           opacity: [0.3, 1, 0.3],
                         }}
                         transition={{ 
                           duration: 1, 
                           repeat: Infinity, 
                           delay: i * 0.1,
                           ease: "easeInOut" 
                         }}
                         className={`w-1 rounded-full ${
                           isSpeaking 
                             ? (messages[messages.length-1]?.analysis?.emotion === 'Angry' ? 'bg-red-400' : 'bg-indigo-400')
                             : 'bg-emerald-400'
                         }`}
                       />
                     ))}
                   </motion.div>
                 )}
                 {(!isListening && !isSpeaking) && (
                   <motion.div
                     initial={{ opacity: 0 }}
                     animate={{ opacity: 1 }}
                     className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.3em]"
                   >
                     System Idle • Awaiting Input
                   </motion.div>
                 )}
               </AnimatePresence>
             </div>
          </div>
          
          {/* Mode Selector */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {(['Empathetic', 'Professional', 'Brutally Honest', 'Zen'] as AssistantMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setAssistantMode(mode)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap border ${
                  assistantMode === mode
                    ? 'bg-indigo-500 text-white border-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.4)]'
                    : 'bg-white/5 text-slate-400 border-white/10 hover:border-indigo-500/50'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-transparent relative">
          {isLiveMode && (
            <div className="absolute inset-0 z-20 bg-slate-950/80 backdrop-blur-2xl flex flex-col items-center justify-center text-white p-8 text-center space-y-8">
              <motion.div 
                animate={{ 
                  scale: [1, 1.1, 1],
                  boxShadow: ["0 0 0px rgba(99, 102, 241, 0.4)", "0 0 60px rgba(99, 102, 241, 0.6)", "0 0 0px rgba(99, 102, 241, 0.4)"]
                }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="w-32 h-32 bg-indigo-500/20 rounded-full flex items-center justify-center border-2 border-indigo-500/50"
              >
                <Radio size={48} className="text-indigo-400 animate-pulse" />
              </motion.div>
              
              <div className="space-y-2">
                <h2 className="text-2xl font-bold aesthetic-gradient-text">Gemini Live Active</h2>
                <p className="text-slate-400 text-sm max-w-xs">
                  {liveStatus === 'connecting' ? 'Establishing secure voice link...' : 'I am listening. Speak naturally, and I will respond in real-time.'}
                </p>
              </div>

              <div className="flex gap-4">
                <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/10">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-ping" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Live EQ Active</span>
                </div>
              </div>

              <button 
                onClick={stopLiveSession}
                className="mt-8 flex items-center gap-2 px-6 py-3 bg-red-500/80 hover:bg-red-600 text-white rounded-2xl font-bold transition-all shadow-[0_0_20px_rgba(239,68,68,0.3)] uppercase tracking-widest text-xs"
              >
                <Power size={18} />
                End Session
              </button>
            </div>
          )}

          {messages.length === 0 && !isLiveMode && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-40">
              <div className="bg-white/5 p-6 rounded-3xl border border-white/10 shadow-inner">
                <Smile className="w-16 h-16 text-indigo-400/50" />
              </div>
              <div className="space-y-2">
                <p className="text-xl font-medium text-slate-300">Hello, I'm your EQ companion.</p>
                <p className="text-sm text-slate-500">How are you feeling today?</p>
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
                    className={`p-4 rounded-3xl shadow-lg relative group ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-tr-none shadow-indigo-500/20'
                        : 'bg-white/5 text-slate-200 border border-white/10 rounded-tl-none backdrop-blur-md'
                    }`}
                  >
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                    
                    {msg.role === 'assistant' && (
                      <div className="absolute -right-12 top-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleFeedback(msg.id, 'helpful')}
                          className={`p-1.5 rounded-xl border transition-all ${msg.feedback === 'helpful' ? 'bg-green-500/20 border-green-500/30 text-green-400' : 'bg-white/5 border-white/10 text-slate-500 hover:text-green-400'}`}
                        >
                          <ThumbsUp size={14} />
                        </button>
                        <button 
                          onClick={() => handleFeedback(msg.id, 'unhelpful')}
                          className={`p-1.5 rounded-xl border transition-all ${msg.feedback === 'unhelpful' ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-white/5 border-white/10 text-slate-500 hover:text-red-400'}`}
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
              <div className="bg-white/5 p-4 rounded-3xl rounded-tl-none border border-white/10 shadow-sm flex items-center gap-3 backdrop-blur-md">
                <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest italic">Analyzing essence...</span>
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-6 bg-white/5 border-t border-white/10 backdrop-blur-xl">
          <div className="relative flex items-center gap-3">
            <button
              onClick={toggleListening}
              className={`p-3 rounded-2xl transition-all ${
                isListening
                  ? 'bg-red-500/20 text-red-400 animate-pulse ring-1 ring-red-500/50'
                  : 'bg-white/5 text-slate-500 hover:bg-white/10 border border-white/10'
              }`}
              title={isListening ? 'Stop Listening' : 'Start Voice Input'}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            <div className="relative flex-1 flex items-center">
              <div className="absolute left-4 z-10 flex items-center pointer-events-none">
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
                className={`w-full glass-input rounded-2xl py-4 pr-14 text-sm text-white placeholder-slate-500 ${realtimeEmotion || isAnalyzingRealtime ? 'pl-12' : 'pl-5'}`}
                disabled={isLoading}
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                className={`absolute right-3 p-2 rounded-xl transition-all ${
                  !input.trim() || isLoading
                    ? 'text-slate-600'
                    : 'text-indigo-400 hover:bg-indigo-500/20'
                }`}
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-[9px] text-slate-500 font-bold uppercase tracking-widest">
            <Sparkles size={12} className="text-indigo-500" />
            <span>AI Essence Analysis Active</span>
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
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-50 flex items-center justify-center p-4"
            onClick={() => setIsProfileOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="glass-card rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-indigo-600/20">
                <div className="flex items-center gap-3">
                  <User className="w-6 h-6 text-indigo-400" />
                  <h2 className="text-xl font-bold aesthetic-gradient-text">Emotional Profile</h2>
                </div>
                <button 
                  onClick={() => setIsProfileOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors text-slate-400"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
                <div>
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-4 uppercase tracking-widest">
                    <Settings className="w-4 h-4 text-indigo-400" />
                    Response Customization
                  </h3>
                  <div className="space-y-6">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-3 block">Assistant Persona</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(['Empathetic', 'Professional', 'Brutally Honest', 'Zen'] as AssistantMode[]).map((mode) => (
                          <button
                            key={mode}
                            onClick={() => setAssistantMode(mode)}
                            className={`px-3 py-2.5 rounded-2xl text-[10px] font-bold uppercase tracking-wider transition-all border ${
                              assistantMode === mode
                                ? 'bg-indigo-500 text-white border-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.3)]'
                                : 'bg-white/5 text-slate-400 border-white/10 hover:border-indigo-500/50'
                            }`}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-3 block">Response Tone</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(['Balanced', 'Formal', 'Casual', 'Humorous'] as ResponseTone[]).map((tone) => (
                          <button
                            key={tone}
                            onClick={() => setResponseTone(tone)}
                            className={`px-3 py-2.5 rounded-2xl text-[10px] font-bold uppercase tracking-wider transition-all border ${
                              responseTone === tone
                                ? 'bg-indigo-500 text-white border-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.3)]'
                                : 'bg-white/5 text-slate-400 border-white/10 hover:border-indigo-500/50'
                            }`}
                          >
                            {tone}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-3 block">Voice Personality</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(['Soothing', 'Energetic', 'Calm', 'Professional'] as VoiceType[]).map((type) => (
                          <button
                            key={type}
                            onClick={() => setVoiceType(type)}
                            className={`px-3 py-2.5 rounded-2xl text-[10px] font-bold uppercase tracking-wider transition-all border ${
                              voiceType === type
                                ? 'bg-indigo-500 text-white border-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.3)]'
                                : 'bg-white/5 text-slate-400 border-white/10 hover:border-indigo-500/50'
                            }`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-white/5 space-y-4">
                      <label className="text-[9px] font-bold text-indigo-400 uppercase tracking-[0.2em] block">Advanced Voice Control</label>
                      
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[8px] font-bold text-slate-500 uppercase tracking-widest block">Gemini Live Voice</label>
                          <div className="grid grid-cols-3 gap-1.5 text-white">
                            {(['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'] as const).map((v) => (
                              <button
                                key={v}
                                onClick={() => setLiveVoiceName(v)}
                                className={`px-2 py-1.5 rounded-lg text-[9px] font-bold transition-all border ${
                                  liveVoiceName === v
                                    ? 'bg-indigo-500 text-white border-indigo-400'
                                    : 'bg-white/5 text-slate-400 border-white/10 hover:border-indigo-500/30'
                                }`}
                              >
                                {v}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[8px] font-bold text-slate-500 uppercase tracking-widest block">System Voice / Accent</label>
                        <select 
                          value={selectedVoiceURI}
                          onChange={(e) => setSelectedVoiceURI(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-slate-300 outline-none focus:border-indigo-500/50 transition-all appearance-none cursor-pointer"
                        >
                          <option value="">Default (Auto-Female)</option>
                          {availableVoices.map((voice) => (
                            <option key={voice.voiceURI} value={voice.voiceURI}>
                              {voice.name} ({voice.lang})
                            </option>
                          ))}
                        </select>
                      </div>

                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-[8px] font-bold text-slate-500 uppercase tracking-widest flex justify-between">
                                <span>Pitch</span>
                                <span className="text-indigo-400">{voicePitch.toFixed(1)}</span>
                              </label>
                              <input 
                                type="range"
                                min="0.5"
                                max="2.0"
                                step="0.1"
                                value={voicePitch}
                                onChange={(e) => setVoicePitch(parseFloat(e.target.value))}
                                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[8px] font-bold text-slate-500 uppercase tracking-widest flex justify-between">
                                <span>Speed</span>
                                <span className="text-indigo-400">{voiceRate.toFixed(1)}</span>
                              </label>
                              <input 
                                type="range"
                                min="0.5"
                                max="2.0"
                                step="0.1"
                                value={voiceRate}
                                onChange={(e) => setVoiceRate(parseFloat(e.target.value))}
                                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[8px] font-bold text-slate-500 uppercase tracking-widest flex justify-between">
                              <span>Mic Sensitivity</span>
                              <span className="text-indigo-400">{Math.round(speechSensitivity * 100)}%</span>
                            </label>
                            <input 
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              value={speechSensitivity}
                              onChange={(e) => setSpeechSensitivity(parseFloat(e.target.value))}
                              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            />
                            <p className="text-[7px] text-slate-600 uppercase font-bold tracking-tighter">Adjusts how readily voice is picked up. Higher = more sensitive.</p>
                          </div>
                        </div>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/10">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-4 uppercase tracking-widest">
                    <Radio className="w-4 h-4 text-indigo-400" />
                    Social Intelligence
                  </h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                       <label className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em] block">Interface Language</label>
                       <select 
                         value={language}
                         onChange={(e) => setLanguage(e.target.value)}
                         className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-slate-300 outline-none focus:border-indigo-500/50 transition-all appearance-none"
                       >
                         <option value="en-US">English (US)</option>
                         <option value="es-MX">Español (MX)</option>
                         <option value="fr-FR">Français (FR)</option>
                         <option value="de-DE">Deutsch (DE)</option>
                         <option value="it-IT">Italiano (IT)</option>
                         <option value="pt-BR">Português (BR)</option>
                         <option value="hi-IN">Hindi (IN)</option>
                         <option value="ja-JP">日本語 (JP)</option>
                         <option value="zh-CN">简体中文 (CN)</option>
                       </select>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em] block">Instagram Handle</label>
                       <input 
                         type="text"
                         value={instagramHandle}
                         onChange={(e) => setInstagramHandle(e.target.value)}
                         placeholder="@yourhandle"
                         className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-slate-300 outline-none focus:border-indigo-500/50 transition-all"
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em] block">Facebook Profile</label>
                       <input 
                         type="text"
                         value={facebookProfile}
                         onChange={(e) => setFacebookProfile(e.target.value)}
                         placeholder="facebook.com/yourprofile"
                         className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-slate-300 outline-none focus:border-indigo-500/50 transition-all"
                       />
                    </div>
                     <div className="space-y-2">
                       <label className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em] block">About for Gemini</label>
                       <textarea 
                         value={geminiInfo}
                         onChange={(e) => setGeminiInfo(e.target.value)}
                         placeholder="Tell Gemini more about your background, goals, or character..."
                         className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-slate-300 outline-none focus:border-indigo-500/50 transition-all h-20 resize-none"
                       />
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-6 pb-6 pt-2 border-t border-white/10">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-4 uppercase tracking-widest">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    Learned Essence
                  </h3>
                  {learnedInsights.length > 0 ? (
                    <div className="space-y-3">
                      {learnedInsights.map((insight, i) => (
                        <div key={i} className="p-4 bg-white/5 rounded-2xl border border-white/10 text-[10px] text-slate-400 leading-relaxed font-medium">
                          {insight}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-500 italic p-6 text-center bg-white/5 rounded-2xl border border-dashed border-white/10 font-medium">
                      Essence not yet distilled. Continue our dialogue to deepen my understanding.
                    </p>
                  )}
                </div>

                <div className="pt-6 border-t border-white/10">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h4 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Dialogue Statistics</h4>
                      <p className="text-[9px] text-slate-500 uppercase tracking-tighter font-medium">Session Data Overview</p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold aesthetic-gradient-text">{messages.length}</div>
                      <div className="text-[9px] text-slate-500 uppercase tracking-[0.2em] font-bold">Messages</div>
                    </div>
                  </div>
                  
                  <button
                    onClick={handleResetProfile}
                    className="w-full flex items-center justify-center gap-2 py-4 px-4 rounded-2xl bg-red-500/10 text-red-400 text-[10px] font-bold uppercase tracking-widest hover:bg-red-500/20 transition-all border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]"
                  >
                    <Trash2 size={16} />
                    Reset Essence
                  </button>
                </div>
              </div>

              <div className="p-4 bg-white/5 border-t border-white/10 text-center">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.2em]">
                  Essence stored locally • Privacy secured
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
        </>
      )}
    </div>
  );
}
