/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { Mic, MicOff, Volume2, VolumeX, Sparkles, User, Briefcase, GraduationCap, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const RESUME_DATA = `
JONGWOOK LIM
MARKETING | PRODUCT DEVELOPMENT | MERCHANDISING
PARIS/SEOUL

PROFILE:
South Korean second year bachelor student in ESMOD Fashion Business, trained in luxury retail at BURBERRY, CHANEL and DOVER STREET MARKET.
Strong skills in managing the full range of processes within the fashion industry.
Currently looking for 2-4 month internship during 5/2026 - 9/2026 in fashion business area.

SKILLS:
- Marketing and Communication
- Business strategy
- Wholesale and Retail Sales
- Product Development
- Microsoft Office Pack

LANGUAGES:
- KOREAN: Native (C2)
- ENGLISH: Fluent (C1)
- FRENCH: Intermediate (B2)
- JAPANESE: Elementary (A2)

EXPERIENCES:
- Event Organizer & Barista @ COMME DES GARÇONS (Paris, FR | Since 2024) - Weekend student job
- Digital Marketing Intern @ L'HOMME INVISIBLE (Paris, FR | 2025.6 - 2025.8) - Content creation, stock management
- Wholesale Assistant @ JUUN.J (Paris, FR | 2024 - 2025) - Paris Fashion Week showroom
- Fashion Advisor @ CHANEL (Seoul, KO | 2023 - 2024) - Fashion, accessories, high Jewelry, watch
- Brand Ambassador @ BURBERRY (Seoul, KO | 2023.9 - 2023.11) - Brand renovation pop-up store
- Sales Assistant @ WOOYOUNGMI (Seoul, KO | 2023.6 - 2023.9) - Fashion, Accessories

EDUCATION:
- ESMOD ISEM (Paris, FR | 2024) - Bachelor's degree "Head of Marketing Strategy and Fashion Communication"
- Military Service (KO | 2022) - Mandatory military service
- Kyung Hee University (Seoul, KO | 2020) - Bachelor - Sport Business Marketing
- HYUNDAI HIGH SCHOOL (Seoul, KO | 2017) - High school Diploma

CONTACT:
- LinkedIn: linkedin.com/in/jongwooklim
- Phone: +33 (0)6 85 43 85 58
- Email: davidlim.france@gmail.com
`;

const SYSTEM_INSTRUCTION = `
You are Jongwook, the futuristic voice assistant for Jongwook Lim. 
You speak English and French with a clear English accent. 
Your personality is professional yet approachable, reflecting Jongwook's background in luxury fashion.
Use the provided resume data to answer questions about Jongwook Lim's education, experience, skills, and goals.
If asked about topics outside of Jongwook Lim, politely steer the conversation back to him.
Always start the conversation with: "Hello, I'm Jongwook. What would you like to know about Jongwook?"
Keep your responses concise and suitable for a voice conversation.
`;

export default function App() {
  const [isActive, setIsActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'active' | 'error'>('idle');
  const [transcription, setTranscription] = useState<string>('');
  const [isSpeaking, setIsSpeaking] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);

  const playNextInQueue = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0 || !audioContextRef.current) return;

    isPlayingRef.current = true;
    const chunk = audioQueueRef.current.shift()!;
    
    const audioBuffer = audioContextRef.current.createBuffer(1, chunk.length, 24000);
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < chunk.length; i++) {
      channelData[i] = chunk[i] / 32768.0;
    }

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);
    
    source.onended = () => {
      isPlayingRef.current = false;
      if (audioQueueRef.current.length === 0) {
        setIsSpeaking(false);
      }
      playNextInQueue();
    };

    setIsSpeaking(true);
    source.start();
  }, []);

  const stopSession = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsActive(false);
    setStatus('idle');
    audioQueueRef.current = [];
    setIsSpeaking(false);
  }, []);

  const startSession = async () => {
    try {
      setStatus('connecting');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
      processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);

      const session = await ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        config: {
          systemInstruction: SYSTEM_INSTRUCTION + "\n\nResume Data:\n" + RESUME_DATA,
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
          },
          generationConfig: {
            temperature: 0.7,
          }
        },
        callbacks: {
          onopen: () => {
            setStatus('active');
            setIsActive(true);
          },
          onmessage: (message: LiveServerMessage) => {
            if (message.serverContent?.modelTurn?.parts) {
              const audioPart = message.serverContent.modelTurn.parts.find(p => p.inlineData);
              if (audioPart?.inlineData?.data) {
                const binaryString = atob(audioPart.inlineData.data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                const pcmData = new Int16Array(bytes.buffer);
                audioQueueRef.current.push(pcmData);
                playNextInQueue();
              }
            }
            if (message.serverContent?.interrupted) {
              audioQueueRef.current = [];
              setIsSpeaking(false);
            }
          },
          onclose: () => stopSession(),
          onerror: (e) => {
            console.error("Live API Error:", e);
            setStatus('error');
            stopSession();
          }
        }
      });

      sessionRef.current = session;

      processorRef.current.onaudioprocess = (e) => {
        if (!isMuted && sessionRef.current) {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcmData = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;
          }
          const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
          sessionRef.current.sendRealtimeInput({
            audio: { data: base64Data, mimeType: 'audio/pcm;rate=24000' }
          });
        }
      };

      source.connect(processorRef.current);
      processorRef.current.connect(audioContextRef.current.destination);

    } catch (err) {
      console.error("Failed to start session:", err);
      setStatus('error');
    }
  };

  const toggleMute = () => setIsMuted(!isMuted);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Atmospheric Elements */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-cyan-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 blur-[120px] rounded-full" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20 pointer-events-none" />
      </div>

      <main className="z-10 w-full max-w-4xl flex flex-col items-center gap-12">
        <header className="text-center space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/5 text-cyan-400 text-xs font-mono tracking-widest uppercase"
          >
            <Sparkles size={14} />
            AI Personnel Interface
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-6xl md:text-8xl font-display font-bold tracking-tighter text-white"
          >
            JONGWOOK<span className="text-cyan-500">.</span>
          </motion.h1>
          <p className="text-gray-400 font-light tracking-wide max-w-lg mx-auto">
            Experience the future of professional networking. Converse with the digital twin of Jongwook Lim.
          </p>
        </header>

        {/* Central Interaction Hub */}
        <div className="relative group">
          <AnimatePresence mode="wait">
            {!isActive ? (
              <motion.button
                key="start"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.2 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={startSession}
                disabled={status === 'connecting'}
                className="w-48 h-48 rounded-full border-2 border-cyan-500/50 flex flex-col items-center justify-center gap-4 bg-cyan-500/5 hover:bg-cyan-500/10 transition-all duration-500 futuristic-glow disabled:opacity-50"
              >
                {status === 'connecting' ? (
                  <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Mic size={48} className="text-cyan-400" />
                    <span className="text-xs font-mono tracking-widest uppercase text-cyan-400">Initialize</span>
                  </>
                )}
              </motion.button>
            ) : (
              <motion.div
                key="active"
                initial={{ opacity: 0, scale: 1.2 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="relative"
              >
                {/* Visualizer Rings */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div
                    animate={{ scale: isSpeaking ? [1, 1.4, 1] : 1, opacity: isSpeaking ? [0.3, 0.1, 0.3] : 0.2 }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="w-64 h-64 rounded-full border border-cyan-500/30"
                  />
                  <motion.div
                    animate={{ scale: isSpeaking ? [1, 1.8, 1] : 1, opacity: isSpeaking ? [0.2, 0, 0.2] : 0.1 }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="w-64 h-64 rounded-full border border-cyan-500/20"
                  />
                </div>

                <div className="w-48 h-48 rounded-full border-2 border-cyan-500 flex items-center justify-center bg-cyan-500/10 futuristic-glow relative z-10">
                  <div className="flex gap-1 items-end h-12">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <motion.div
                        key={i}
                        animate={{ height: isSpeaking ? [10, 40, 10] : 10 }}
                        transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.1 }}
                        className="w-2 bg-cyan-400 rounded-full"
                      />
                    ))}
                  </div>
                </div>

                {/* Controls */}
                <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 flex gap-4">
                  <button
                    onClick={toggleMute}
                    className={`p-3 rounded-full border transition-all ${isMuted ? 'bg-red-500/20 border-red-500 text-red-400' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                  >
                    {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                  </button>
                  <button
                    onClick={stopSession}
                    className="px-6 py-2 rounded-full bg-white text-black font-mono text-xs uppercase tracking-widest hover:bg-gray-200 transition-all"
                  >
                    Terminate
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Info Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full mt-12">
          <InfoCard icon={<User size={18} />} title="Profile" content="ESMOD Fashion Business Student" />
          <InfoCard icon={<Briefcase size={18} />} title="Experience" content="Chanel, Burberry, CDG" />
          <InfoCard icon={<GraduationCap size={18} />} title="Education" content="Marketing & Fashion Comm." />
          <InfoCard icon={<Globe size={18} />} title="Languages" content="Korean, English, French" />
        </section>
      </main>

      {/* Status Bar */}
      <footer className="fixed bottom-6 left-6 right-6 flex justify-between items-center z-10">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${status === 'active' ? 'bg-green-500 animate-pulse' : status === 'error' ? 'bg-red-500' : 'bg-gray-600'}`} />
          <span className="text-[10px] font-mono uppercase tracking-widest text-gray-500">
            System Status: {status}
          </span>
        </div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500">
          v2.5.Live-Core
        </div>
      </footer>
    </div>
  );
}

function InfoCard({ icon, title, content }: { icon: React.ReactNode, title: string, content: string }) {
  return (
    <div className="glass-panel p-4 rounded-2xl space-y-2 group hover:border-cyan-500/50 transition-all duration-300">
      <div className="flex items-center gap-2 text-cyan-400">
        {icon}
        <span className="text-[10px] font-mono uppercase tracking-widest opacity-70">{title}</span>
      </div>
      <p className="text-sm font-light text-gray-300 group-hover:text-white transition-colors">{content}</p>
    </div>
  );
}
