import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  BookOpen,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  RotateCcw,
  Volume2,
  VolumeX,
  Flame,
  Sun,
  Moon,
  Type,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type LessonData = {
  mainIdea: string;
  rootWords: string;
  sideMargins: string;
  bottomMargins: string;
  dailyLife: string;
};

type FontSize = "small" | "medium" | "large";

const STEPS = [
  { id: "mainIdea", title: "Main Idea", subtitle: "Core message of the page" },
  {
    id: "rootWords",
    title: "Root Words & Grammar",
    subtitle: "Linguistic insights",
  },
  { id: "sideMargins", title: "Side Margins", subtitle: "Context and Tafsir" },
  {
    id: "bottomMargins",
    title: "Bottom Margins",
    subtitle: "Footnotes & Cross-references",
  },
  { id: "dailyLife", title: "Daily Life", subtitle: "Actionable reflections" },
];

export default function App() {
  const [day, setDay] = useState(1);
  const [loading, setLoading] = useState(false);
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [streak, setStreak] = useState(0);
  const [lastCompletedDate, setLastCompletedDate] = useState<string | null>(
    null,
  );
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [fontSize, setFontSize] = useState<FontSize>("medium");
  const [isPdfExpanded, setIsPdfExpanded] = useState(false);

  const isDark = theme === "dark";

  const toggleTheme = () => {
    const newTheme = isDark ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("imprint_quran_theme", newTheme);
  };

  const cycleFontSize = () => {
    const nextSize = {
      small: "medium",
      medium: "large",
      large: "small",
    }[fontSize] as FontSize;
    setFontSize(nextSize);
    localStorage.setItem("imprint_quran_font_size", nextSize);
  };

  const getFontSizeClasses = () => {
    switch (fontSize) {
      case "small":
        return "text-[0.95rem] leading-[1.6]";
      case "large":
        return "text-[1.25rem] leading-[2]";
      case "medium":
      default:
        return "text-[1.1rem] leading-[1.8]";
    }
  };

  useEffect(() => {
    const savedStreak = localStorage.getItem("imprint_quran_streak");
    const savedDate = localStorage.getItem("imprint_quran_last_date");
    const savedTheme = localStorage.getItem("imprint_quran_theme") as
      | "light"
      | "dark"
      | null;
    const savedFontSize = localStorage.getItem(
      "imprint_quran_font_size",
    ) as FontSize | null;

    if (savedStreak) setStreak(parseInt(savedStreak, 10));
    if (savedDate) setLastCompletedDate(savedDate);
    if (savedTheme) setTheme(savedTheme);
    if (savedFontSize) setFontSize(savedFontSize);

    fetch("/api/progress")
      .then((res) => res.json())
      .then((data) => {
        if (data && data.day) {
          setDay(data.day);
        }
      })
      .catch((err) => console.error("Could not fetch progress", err));

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, [stepIndex, lesson, showSummary]);

  const updateDay = async (newDay: number) => {
    setDay(newDay);
    try {
      await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day: newDay }),
      });
    } catch (err) {
      console.error("Could not save progress", err);
    }
  };

  useEffect(() => {
    if (showSummary) {
      const today = new Date().toISOString().split("T")[0];
      if (lastCompletedDate !== today) {
        let newStreak = streak;
        if (lastCompletedDate) {
          const lastDate = new Date(lastCompletedDate);
          const currentDate = new Date(today);
          const diffTime = Math.abs(currentDate.getTime() - lastDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays === 1) {
            newStreak += 1;
          } else if (diffDays > 1) {
            newStreak = 1;
          }
        } else {
          newStreak = 1;
        }

        setStreak(newStreak);
        setLastCompletedDate(today);
        localStorage.setItem("imprint_quran_streak", newStreak.toString());
        localStorage.setItem("imprint_quran_last_date", today);
      }
    }
  }, [showSummary, lastCompletedDate, streak]);

  const toggleSpeech = (text: string) => {
    if (!window.speechSynthesis) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const fetchLesson = async () => {
    setLoading(true);
    setError("");
    setLesson(null);
    setStepIndex(0);
    try {
      const response = await fetch(`/api/lesson/${day}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to fetch lesson");

      setLesson(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex((prev) => prev + 1);
    } else {
      setShowSummary(true);
    }
  };

  const handlePrev = () => {
    if (stepIndex > 0) {
      setStepIndex((prev) => prev - 1);
    }
  };

  if (showSummary) {
    const totalQuranPages = 604;
    const progressPercentage = (day / totalQuranPages) * 100;
    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset =
      circumference - (progressPercentage / 100) * circumference;

    return (
      <div
        className={`min-h-screen flex items-center justify-center p-6 font-sans transition-colors duration-300 ${isDark ? "bg-slate-900 text-slate-50" : "bg-[#FDFBF7] text-slate-900"}`}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`p-8 rounded-3xl max-w-sm w-full text-center space-y-8 shadow-2xl border transition-colors duration-300 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}
        >
          <div className="space-y-2">
            <div
              className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 ${isDark ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-100 text-emerald-600"}`}
            >
              <CheckCircle2 size={32} />
            </div>
            <h1 className="text-3xl font-serif font-medium">Alhamdulillah</h1>
            <p className={isDark ? "text-slate-400" : "text-slate-500"}>
              You've completed today's reflection.
            </p>
          </div>

          <div className="relative w-40 h-40 mx-auto flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="80"
                cy="80"
                r={radius}
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                className={isDark ? "text-slate-700" : "text-slate-200"}
              />
              <circle
                cx="80"
                cy="80"
                r={radius}
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="text-emerald-500 transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-serif font-medium">{day}</span>
              <span
                className={`text-xs uppercase tracking-widest mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}
              >
                Pages
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              const nextDay = day + 1;
              updateDay(nextDay);
              setLesson(null);
              setStepIndex(0);
              setShowSummary(false);
            }}
            className={`w-full py-4 px-6 rounded-xl font-medium transition ${isDark ? "bg-white text-slate-900 hover:bg-slate-100" : "bg-slate-900 text-white hover:bg-slate-800"}`}
          >
            Continue
          </button>
        </motion.div>
      </div>
    );
  }

  if (!lesson && !loading) {
    return (
      <div
        className={`min-h-screen flex flex-col p-6 transition-colors duration-300 ${isDark ? "bg-slate-900 text-slate-50" : "bg-[#FDFBF7] text-slate-800"}`}
      >
        <div className="w-full max-w-md mx-auto flex justify-end mb-4">
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-full transition ${isDark ? "bg-slate-800 hover:bg-slate-700 text-slate-400" : "bg-white border border-slate-200 hover:bg-slate-100 text-slate-500"}`}
            aria-label="Toggle Theme"
          >
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md w-full text-center space-y-8"
          >
            <div className="space-y-4">
              <div className="flex justify-center mb-6">
                <div
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-full shadow-sm ${isDark ? "bg-orange-500/20 text-orange-400" : "bg-orange-100 text-orange-600"}`}
                >
                  <Flame
                    size={20}
                    className={
                      streak > 0
                        ? isDark
                          ? "fill-orange-400"
                          : "fill-orange-600"
                        : ""
                    }
                  />
                  <span className="font-bold">{streak} Day Streak</span>
                </div>
              </div>
              <div
                className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-sm ${isDark ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-100 text-emerald-600"}`}
              >
                <BookOpen size={32} />
              </div>
              <h1
                className={`text-3xl font-serif font-medium tracking-tight ${isDark ? "text-slate-50" : "text-slate-900"}`}
              >
                Daily Quran Insights
              </h1>
              <p
                className={`font-sans text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}
              >
                Bite-sized reflections based directly on the provided PDF's
                layout, margins, and text.
              </p>
            </div>

            <div
              className={`p-6 rounded-2xl shadow-sm border space-y-6 transition-colors duration-300 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-100"}`}
            >
              <div>
                <p
                  className={`text-sm font-medium mb-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}
                >
                  Current Position
                </p>
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={() => updateDay(Math.max(1, day - 1))}
                    className={`p-2 rounded-full transition ${isDark ? "text-slate-400 hover:text-white hover:bg-slate-700" : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"}`}
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <span className="text-2xl font-serif font-medium w-24 text-center">
                    Page {day}
                  </span>
                  <button
                    onClick={() => updateDay(day + 1)}
                    className={`p-2 rounded-full transition ${isDark ? "text-slate-400 hover:text-white hover:bg-slate-700" : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"}`}
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>

              {error && (
                <div
                  className={`p-3 rounded-lg text-sm text-left border ${isDark ? "bg-red-900/30 text-red-400 border-red-900/50" : "bg-red-50 text-red-600 border-red-100"}`}
                >
                  <p className="font-medium">Error loading page.</p>
                  <p className="opacity-90 mt-1">{error}</p>
                  <p className="text-xs opacity-75 mt-2">
                    Note: The first time downloading the full PDF may take up to
                    30 seconds.
                  </p>
                </div>
              )}

              <button
                onClick={fetchLesson}
                className={`w-full rounded-xl py-3.5 px-6 font-medium transition flex items-center justify-center gap-2 ${isDark ? "bg-emerald-600 text-white hover:bg-emerald-500" : "bg-slate-900 text-white hover:bg-slate-800"}`}
              >
                Start Today's Lesson
                <ChevronRight size={18} />
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center p-6 ${isDark ? "bg-slate-900 text-slate-50" : "bg-[#FDFBF7] text-slate-800"}`}
      >
        <div className="text-center space-y-6 max-w-sm w-full">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
            className={`w-12 h-12 border-4 rounded-full mx-auto ${isDark ? "border-slate-800 border-t-emerald-500" : "border-slate-200 border-t-emerald-600"}`}
          />
          <div className="space-y-2">
            <h2 className="text-lg font-serif font-medium">
              Extracting Text & Margins...
            </h2>
            <p
              className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}
            >
              Gemini 3.5 Flash is analyzing Page {day} of the Quran PDF.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (lesson) {
    const currentStepData = STEPS[stepIndex];
    const content = lesson[currentStepData.id as keyof LessonData];
    const progressPercentage = ((stepIndex + 1) / STEPS.length) * 100;

    return (
      <div
        className={`min-h-screen flex flex-col xl:flex-row font-sans transition-colors duration-300 ${isDark ? "bg-slate-900 text-slate-50" : "bg-[#FDFBF7] text-slate-800"}`}
      >
        {isPdfExpanded && (
          <div className="fixed inset-0 z-50 bg-black/95 flex flex-col xl:hidden">
            <div className="flex justify-end p-4 border-b border-white/10">
              <button
                onClick={() => setIsPdfExpanded(false)}
                className="text-slate-400 hover:text-white p-2 transition"
                aria-label="Close PDF"
              >
                <Minimize2 size={24} />
              </button>
            </div>
            <div className="flex-1 overflow-auto flex justify-center items-start pt-4 px-4 pb-24 pdf-container">
              <Document
                file={`/api/lesson/${day}/pdf`}
                loading={<div className="text-emerald-500 font-medium">Loading Page ${day}...</div>}
              >
                <Page pageNumber={1} renderTextLayer={false} renderAnnotationLayer={false} width={800} />
              </Document>
            </div>
          </div>
        )}

        <div className="hidden xl:flex xl:w-2/5 xl:border-r border-slate-700/50 bg-[#1A1A1A] flex-col relative h-screen">
          <div className="flex-1 overflow-auto flex justify-center items-center p-8 pdf-container">
            <Document
              file={`/api/lesson/${day}/pdf`}
              loading={<div className="text-emerald-500 font-medium">Loading Page ${day}...</div>}
              className="shadow-2xl ring-1 ring-white/10"
            >
              <Page pageNumber={1} renderTextLayer={false} renderAnnotationLayer={false} width={650} />
            </Document>
          </div>
        </div>

        <div className="flex-1 flex flex-col relative h-screen overflow-y-auto">
          {/* Progress Bar Header */}
          <div className="px-6 py-8 pb-4 w-full max-w-md mx-auto xl:max-w-xl space-y-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setLesson(null)}
                className={`p-2 -ml-2 transition ${isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900"}`}
                aria-label="Quit lesson"
              >
                <RotateCcw size={20} />
              </button>
              <span
                className={`text-xs font-medium uppercase tracking-wider ${isDark ? "text-slate-500" : "text-slate-400"}`}
              >
                {stepIndex + 1} of {STEPS.length}
              </span>
              <div className="flex items-center gap-1 -mr-2">
                <button
                  onClick={() => setIsPdfExpanded(true)}
                  className={`p-2 transition xl:hidden ${isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900"}`}
                  aria-label="Show PDF"
                  title="Show Original Page"
                >
                  <BookOpen size={18} />
                </button>
                <button
                  onClick={cycleFontSize}
                  className={`p-2 transition flex items-center gap-1 ${isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900"}`}
                  aria-label="Change Font Size"
                  title={`Font Size: ${fontSize}`}
                >
                  <Type size={18} />
                  <span className="text-[10px] font-bold uppercase w-2">
                    {fontSize.charAt(0)}
                  </span>
                </button>
                <button
                  onClick={toggleTheme}
                  className={`p-2 transition ${isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900"}`}
                  aria-label="Toggle Theme"
                >
                  {isDark ? <Sun size={20} /> : <Moon size={20} />}
                </button>
              </div>
            </div>

            <div
              className={`w-full h-1.5 rounded-full overflow-hidden ${isDark ? "bg-slate-800" : "bg-slate-200"}`}
            >
              <motion.div
                className={`h-full rounded-full ${isDark ? "bg-emerald-500" : "bg-emerald-600"}`}
                initial={{ width: 0 }}
                animate={{ width: `${progressPercentage}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>

          {/* Card Content Area */}
          <div className="flex-1 flex flex-col relative w-full max-w-md mx-auto xl:max-w-xl">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={stepIndex}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="flex-1 flex flex-col px-6 py-6"
              >
                <div className="flex items-start justify-between mb-8 gap-4">
                  <div>
                    <h2
                      className={`font-medium text-sm tracking-widest uppercase mb-2 ${isDark ? "text-emerald-400" : "text-emerald-600"}`}
                    >
                      {currentStepData.subtitle}
                    </h2>
                    <h1 className="text-3xl font-serif font-medium leading-tight">
                      {currentStepData.title}
                    </h1>
                  </div>
                  <button
                    onClick={() => toggleSpeech(content)}
                    className={`p-3 rounded-full transition shrink-0 ${isSpeaking ? (isDark ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-100 text-emerald-600") : isDark ? "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700" : "bg-white border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
                    aria-label={isSpeaking ? "Stop reading" : "Read aloud"}
                  >
                    {isSpeaking ? <VolumeX size={20} /> : <Volume2 size={20} />}
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto pb-24 space-y-6">
                  <p
                    className={`${getFontSizeClasses()} font-sans tracking-wide transition-all ${isDark ? "text-slate-300" : "text-slate-700"}`}
                  >
                    {content}
                  </p>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Navigation Controls */}
            <div
              className={`absolute bottom-0 left-0 right-0 p-6 flex items-center justify-between gap-4 bg-gradient-to-t ${isDark ? "from-slate-900 via-slate-900 to-transparent" : "from-[#FDFBF7] via-[#FDFBF7] to-transparent"}`}
            >
              <button
                onClick={handlePrev}
                disabled={stepIndex === 0}
                className={`p-4 rounded-full border transition ${stepIndex === 0 ? "opacity-30 cursor-not-allowed" : isDark ? "hover:bg-slate-800 active:bg-slate-700" : "hover:bg-slate-100 active:bg-slate-200"} ${isDark ? "border-slate-700" : "border-slate-300 bg-white"}`}
              >
                <ChevronLeft
                  size={24}
                  className={isDark ? "text-white" : "text-slate-900"}
                />
              </button>

              <button
                onClick={handleNext}
                className={`flex-1 flex items-center justify-center gap-2 py-4 px-6 rounded-full font-medium text-lg transition ${isDark ? "bg-white text-slate-900 hover:bg-slate-100 active:bg-slate-200 shadow-[0_0_40px_rgba(255,255,255,0.1)]" : "bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-700 shadow-md"}`}
              >
                {stepIndex === STEPS.length - 1 ? (
                  <>
                    Complete <CheckCircle2 size={20} />
                  </>
                ) : (
                  <>
                    Continue <ChevronRight size={20} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
