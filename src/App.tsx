/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Smile, Frown, Angry, Ghost, Meh, Zap, Loader2, MessageSquare, Info, HelpCircle, AlertCircle, Mic, MicOff, ThumbsUp, ThumbsDown, Settings, Volume2, VolumeX, Sparkles, Target, ShieldAlert, Wind, User, Trash2, X, Download, FileJson, FileText, Radio, Power } from 'lucide-react';
import { GoogleGenAI, Type, Modality, LiveServerMessage } from "@google/genai";

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [isHandsFree, setIsHandsFree] = useState(false);
  const [assistantMode, setAssistantMode] = useState<AssistantMode>('Empathetic');
  const [responseTone, setResponseTone] = useState<ResponseTone>('Balanced');
  const [voiceType, setVoiceType] = useState<VoiceType>('Soothing');
  const [learnedInsights, setLearnedInsights] = useState<string[]>([]);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [realtimeEmotion, setRealtimeEmotion] = useState<Emotion | null>(null);
  const [isAnalyzingRealtime, setIsAnalyzingRealtime] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [liveStatus, setLiveStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const liveSessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);
  const nextStartTimeRef = useRef(0);

  // Load data from localStorage on mount
  useEffect(() => {
    const savedMessages = localStorage.getItem('sentiment_messages');
    const savedInsights = localStorage.getItem('sentiment_insights');
    const savedMode = localStorage.getItem('sentiment_mode');
    const savedTone = localStorage.getItem('sentiment_tone');
    const savedVoiceType = localStorage.getItem('sentiment_voice_type');
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
    if (savedTone) setResponseTone(savedTone as ResponseTone);
    if (savedVoiceType) setVoiceType(savedVoiceType as VoiceType);
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
    localStorage.setItem('sentiment_tone', responseTone);
  }, [responseTone]);

  useEffect(() => {
    localStorage.setItem('sentiment_voice_type', voiceType);
  }, [voiceType]);

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

        // If in hands-free mode and we have a final result, auto-send
        if (isHandsFree && event.results[event.results.length - 1].isFinal) {
          recognitionRef.current.stop();
          // We need to use a timeout to ensure the state is updated or pass the transcript directly
          setTimeout(() => handleSend(transcript), 500);
        }
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
    
    // Select a female voice
    const voices = window.speechSynthesis.getVoices();
    const femaleVoice = voices.find(voice => 
      voice.name.toLowerCase().includes('female') || 
      voice.name.toLowerCase().includes('google uk english female') ||
      voice.name.toLowerCase().includes('samantha') ||
      voice.name.toLowerCase().includes('victoria')
    );
    
    if (femaleVoice) {
      utterance.voice = femaleVoice;
    }

    // Adjust voice based on selected personality
    switch (voiceType) {
      case 'Soothing':
        utterance.rate = 0.8;
        utterance.pitch = 0.9;
        break;
      case 'Energetic':
        utterance.rate = 1.2;
        utterance.pitch = 1.2;
        break;
      case 'Calm':
        utterance.rate = 0.85;
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
    
    utterance.onend = () => {
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
        contents: `Current User Input: "${text}"\n\nConversation History:\n${historyContext}\n\n${insightsContext}`,
        config: {
          systemInstruction: `You are a highly advanced Emotional Intelligence (EQ) AI that CONTINUOUSLY LEARNS from every interaction. 
          You are currently operating in "${assistantMode}" mode with a "${responseTone}" tone.

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

  const handleSend = async (overrideInput?: string) => {
    const textToSend = overrideInput || input;
    if (!textToSend.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: textToSend,
      timestamp: new Date(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

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
      setLiveStatus('connecting');
      setIsLiveMode(true);

      // 1. Setup Audio Context
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      // 2. Setup Microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const source = audioContext.createMediaStreamSource(stream);

      // 3. Setup Processor (using ScriptProcessor for simplicity in this environment)
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
              if (liveStatus === 'connected' || true) { // Check ref or status
                const inputData = e.inputBuffer.getChannelData(0);
                // Convert Float32 to Int16
                const pcmData = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                  pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
                }
                // Convert to Base64
                const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
                
                sessionPromise.then(session => {
                  session.sendRealtimeInput({
                    audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
                  });
                });
              }
            };
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              const binary = atob(base64Audio);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              const pcmData = new Int16Array(bytes.buffer);
              
              // Play PCM data
              playPCM(pcmData);
            }

            // Handle Transcription
            const transcription = message.serverContent?.modelTurn?.parts[0]?.text;
            if (transcription) {
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'assistant' && !last.analysis) {
                   return [...prev.slice(0, -1), { ...last, content: last.content + transcription }];
                }
                return [...prev, {
                  id: Date.now().toString(),
                  role: 'assistant',
                  content: transcription,
                  timestamp: new Date()
                }];
              });
            }

            // Handle Interruption
            if (message.serverContent?.interrupted) {
              audioQueueRef.current = [];
              isPlayingRef.current = false;
              // In a real app, we'd stop the current source node
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
            // 'Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceType === 'Soothing' || voiceType === 'Calm' ? "Kore" : "Zephyr" } },
          },
          systemInstruction: `You are a friendly, empathetic female AI companion in a LIVE voice session. 
          Your voice is ${voiceType.toLowerCase()}, clear, warm, and easy to understand.
          You are currently using a "${responseTone}" tone.
          Keep your responses concise and conversational. 
          Focus on building a warm rapport and validating the user's feelings.
          Since this is a voice session, avoid long lists or complex formatting.`,
        },
      });

      liveSessionRef.current = await sessionPromise;

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
                onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
                className={`p-2 rounded-xl transition-all ${isVoiceEnabled ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-white/5 text-slate-400 border border-white/10'}`}
                title={isVoiceEnabled ? 'Disable Voice Response' : 'Enable Voice Response'}
              >
                {isVoiceEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
              <button 
                onClick={() => setMessages([])}
                className="text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors px-2"
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
                onClick={handleSend}
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
                  </div>
                </div>

                <div className="pt-6 border-t border-white/10">
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
    </div>
  );
}
