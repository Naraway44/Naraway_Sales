import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, MicOff, X, Volume2 } from "lucide-react";
import { askAssistant } from "@/api/marketplace";

/* Speech recognition ships under two names — the unprefixed standard and Chrome's
 * webkit-prefixed original, which is still what most installed browsers expose. Typed
 * loosely here rather than pulling a DOM lib type that isn't in this project's TS config. */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

function getRecognition(): RecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/* Answers are written to be *spoken*, not read: short sentences, no punctuation a synth
 * voice stumbles over, no bullet lists. The keyword sets are what a person actually says
 * out loud ("how much", "costly") rather than the words used on the page ("pricing tiers"). */
interface Answer {
  keywords: string[];
  say: string;
  /** Offered as a follow-up button when this answer lands. */
  action?: { label: string; to: string };
}

const ANSWERS: Answer[] = [
  {
    keywords: ["price", "pricing", "cost", "costly", "how much", "rate", "charge", "expensive", "cheap"],
    say: "Pricing depends on how many leads you buy. You pick the quantity, and the total is shown before you pay. Larger orders cost less per lead. There is no monthly subscription — you only pay when you buy.",
    action: { label: "See pricing", to: "/#pricing" },
  },
  {
    keywords: ["exclusive", "shared", "same lead", "other buyer", "competitor", "someone else"],
    say: "Every lead goes to exactly one buyer. Once you buy it, it is yours alone for two months. We do not resell it to anyone else, so you are never racing another agency to call the same number.",
  },
  {
    keywords: ["where", "come from", "source", "scraped", "quality", "authentic", "real", "genuine"],
    say: "Leads come from real business activity and are checked before they are listed. You see the company, the industry, the location and why they are worth calling — all before you pay anything.",
  },
  {
    keywords: ["what do i get", "included", "contact", "phone", "email", "details", "before paying", "preview"],
    say: "Before you pay you see the company name, industry, location, what they need, and the signal that says why they are worth calling now. The phone number and email unlock the moment you buy.",
  },
  {
    keywords: ["access", "sign up", "signup", "register", "account", "join", "start", "how do i get"],
    say: "You request access with your details, we review it, and we send your login if you are approved. It is free to apply and you do not need a card to request access.",
    action: { label: "Request access", to: "/request-access" },
  },
  {
    keywords: ["download", "export", "excel", "csv", "crm", "spreadsheet"],
    say: "Yes. Everything you buy sits in your dashboard and you can export it any time. There are no expiring links.",
  },
  {
    keywords: ["pay", "payment", "upi", "card", "razorpay", "how do i pay"],
    say: "You can pay by U P I or card through our payment partner. We never store your card details.",
  },
  {
    keywords: ["refund", "wrong", "bad lead", "not working", "issue", "problem", "guarantee"],
    say: "If a contact looks wrong, email our support team with the details and we will look into it.",
  },
  {
    keywords: ["who is this for", "who uses", "agency", "sales team", "founder", "suitable"],
    say: "Agencies, sales teams and founders selling business to business. Anyone who needs fresh conversations and does not want a list that everyone else has already called.",
  },
  {
    keywords: ["subscription", "monthly", "recurring", "contract", "lock in"],
    say: "There is no monthly subscription. You buy when you need pipeline and skip when you do not.",
  },
];

const GREETING =
  "Hi. Ask me anything about LeadStack — pricing, how leads work, or how to get access.";

const FALLBACK =
  "I did not catch that one. Try asking about pricing, exclusivity, what you get with a lead, or how to request access.";

function findAnswer(said: string): Answer | null {
  const text = said.toLowerCase();
  let best: { answer: Answer; score: number } | null = null;

  for (const answer of ANSWERS) {
    // Longer keyword matches win — "how much" should beat a stray "how" in another entry.
    const score = answer.keywords.reduce(
      (total, keyword) => (text.includes(keyword) ? total + keyword.length : total),
      0
    );
    if (score > 0 && (!best || score > best.score)) best = { answer, score };
  }

  return best?.answer ?? null;
}

type Status = "idle" | "listening" | "thinking" | "speaking";

/** Set once the visitor has been greeted, so a returning visitor isn't talked at on every
 *  page view — the greeting is a welcome, not an alarm. */
const GREETED_KEY = "leadstack_voice_greeted";

export function VoiceAssistant() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const [status, setStatus] = useState<Status>("idle");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState(GREETING);
  const [action, setAction] = useState<Answer["action"]>(undefined);
  const [error, setError] = useState("");
  const [supported, setSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const greetedRef = useRef(false);

  useEffect(() => {
    setSupported(Boolean(getRecognition()) && "speechSynthesis" in window);
  }, []);

  // Nothing should still be talking after the panel closes or the page changes.
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
      recognitionRef.current?.stop();
    };
  }, []);

  const speak = useCallback((text: string, onDone?: () => void) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.02;
    utterance.pitch = 1;
    utterance.onend = () => {
      setStatus("idle");
      onDone?.();
    };
    setStatus("speaking");
    window.speechSynthesis.speak(utterance);
  }, []);

  /* Browsers refuse to play audio until the visitor has interacted with the page, so the
   * greeting can't fire on load however much we'd like it to. It's armed instead on the
   * first pointer, key or scroll event — which in practice lands within a second or two —
   * and only for a visitor who hasn't been greeted before. */
  useEffect(() => {
    if (!supported) return;
    try {
      if (sessionStorage.getItem(GREETED_KEY)) return;
    } catch {
      /* private mode — greet anyway */
    }

    const greet = () => {
      if (greetedRef.current) return;
      greetedRef.current = true;
      try {
        sessionStorage.setItem(GREETED_KEY, "1");
      } catch {
        /* nothing to do — the greeting just repeats next visit */
      }
      speak(GREETING);
    };

    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "scroll"];
    events.forEach((event) => window.addEventListener(event, greet, { once: true, passive: true }));
    return () => events.forEach((event) => window.removeEventListener(event, greet));
  }, [supported, speak]);

  /* Set by respondTo so the answer's own onend can reopen the mic — a real back-and-forth
   * rather than making the visitor press the button between every question. Held in a ref
   * because listen() and respondTo() would otherwise depend on each other. */
  const listenRef = useRef<() => void>(() => {});

  const respondTo = useCallback(
    async (said: string) => {
      const match = findAnswer(said);
      setStatus("thinking");

      /* The model answers anything; the canned set only covers ten topics. So the model is
       * tried first and the keyword match is the safety net — for a missing API key, an
       * upstream outage, or a rate limit. A visitor never gets silence either way. */
      let text = match?.say ?? FALLBACK;
      try {
        const result = await askAssistant(said);
        if (result.answered && result.reply) text = result.reply;
      } catch {
        /* fall through to the canned answer already in `text` */
      }

      setReply(text);
      setAction(match?.action);
      speak(text, () => {
        // Keep the conversation open unless the answer handed them somewhere to go.
        if (!match?.action) listenRef.current();
      });
    },
    [speak]
  );

  const listen = useCallback(() => {
    const Recognition = getRecognition();
    if (!Recognition) {
      setSupported(false);
      return;
    }

    window.speechSynthesis?.cancel();
    setError("");
    setHeard("");

    const recognition = new Recognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const said = event.results[0]?.[0]?.transcript ?? "";
      setHeard(said);
      if (said) respondTo(said);
    };

    recognition.onerror = (event) => {
      setStatus("idle");
      setError(
        event.error === "not-allowed"
          ? "Microphone access is blocked. Allow it in your browser settings, or type your question instead."
          : "Didn't catch that. Try again, or type your question instead."
      );
    };

    recognition.onend = () => setStatus((s) => (s === "listening" ? "idle" : s));

    recognitionRef.current = recognition;
    setStatus("listening");
    recognition.start();
  }, [respondTo]);

  useEffect(() => {
    listenRef.current = listen;
  }, [listen]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
    setStatus("idle");
  }, []);

  function close() {
    stop();
    setOpen(false);
  }

  function handleAction(to: string) {
    stop();
    setOpen(false);
    if (to.startsWith("/#")) {
      const id = to.slice(2);
      if (window.location.pathname === "/") {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
      } else {
        window.location.href = to;
      }
      return;
    }
    navigate(to);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setReply(GREETING);
          setAction(undefined);
        }}
        aria-label="Open the LeadStack voice assistant"
        className="voice-orb fixed bottom-5 right-5 z-50 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Mic size={22} strokeWidth={2.2} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 w-[min(22rem,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-border bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full ${
              status === "listening"
                ? "bg-primary text-white"
                : status === "speaking"
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {status === "speaking" ? <Volume2 size={15} /> : <Mic size={15} />}
          </span>
          <p className="text-sm font-semibold">
            {status === "listening"
              ? "Listening…"
              : status === "thinking"
                ? "Thinking…"
                : status === "speaking"
                  ? "Answering…"
                  : "Ask LeadStack"}
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close assistant"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X size={16} />
        </button>
      </div>

      <div className="px-4 py-4" aria-live="polite">
        <div className="mb-4 flex justify-center">
          <div
            className={`voice-orb flex h-20 w-20 items-center justify-center rounded-full text-white ${
              status === "speaking"
                ? "voice-orb--speaking bg-primary"
                : status === "listening" || status === "thinking"
                  ? "voice-orb--listening bg-primary"
                  : "bg-primary/80"
            }`}
          >
            {status === "speaking" ? <Volume2 size={26} /> : <Mic size={26} />}
          </div>
        </div>

        {heard && <p className="mb-2 text-xs text-muted-foreground">You asked: “{heard}”</p>}
        <p className="text-sm leading-relaxed text-foreground">{reply}</p>

        {action && (
          <button
            type="button"
            onClick={() => handleAction(action.to)}
            className="mt-3 inline-flex rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            {action.label}
          </button>
        )}

        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

        {!supported && (
          <p className="mt-3 text-xs text-muted-foreground">
            Voice isn’t supported in this browser. Chrome or Edge will work, or you can{" "}
            <a href="mailto:support@equidamai.com" className="font-medium text-primary hover:underline">
              email us
            </a>
            .
          </p>
        )}
      </div>

      {supported && (
        <div className="border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={status === "listening" ? stop : listen}
            className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
              status === "listening"
                ? "bg-muted text-foreground hover:bg-muted/70"
                : "bg-primary text-primary-foreground hover:opacity-90"
            }`}
          >
            {status === "listening" ? (
              <>
                <MicOff size={16} /> Stop
              </>
            ) : (
              <>
                <Mic size={16} /> Hold a question
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
