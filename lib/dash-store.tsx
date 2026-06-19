"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  Professor,
  ProfessorSeed,
  Attachment,
  VerificationResult,
  EngagementResult,
} from "@/lib/types";
import {
  DEFAULT_SUBJECT,
  DEFAULT_BODY,
  DEFAULT_SIGNATURE,
  DEFAULT_SENDER,
  DEFAULT_THROTTLE_SECONDS,
  MIN_THROTTLE_SECONDS,
} from "@/lib/template";
import { buildEmail, type SenderInfo } from "@/lib/merge";

const STORAGE_KEY = "profping:data:v2";
const MAX_BASE64_LEN = 4 * 1024 * 1024;

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface DashContextValue {
  professors: Professor[];
  verifyingIds: Set<string>;

  addSeeds: (seeds: ProfessorSeed[]) => number;
  updateProf: (id: string, partial: Partial<Professor>) => void;
  setSelected: (id: string, selected: boolean) => void;
  setManySelected: (ids: string[], selected: boolean) => void;
  removeProfessor: (id: string) => void;
  editHook: (id: string, value: string) => void;
  clearAll: () => void;

  generateHook: (id: string) => Promise<void>;
  generateHooksFor: (ids: string[]) => Promise<void>;
  sendSelected: () => Promise<void>;
  sending: boolean;

  checkResponses: () => Promise<void>;
  checking: boolean;
  trackError: string;

  subject: string;
  setSubject: (v: string) => void;
  body: string;
  setBody: (v: string) => void;
  signature: string;
  setSignature: (v: string) => void;
  sender: SenderInfo;
  setSender: (v: SenderInfo) => void;
  attachment: Attachment | null;
  setAttachment: (a: Attachment | null) => void;
  attachmentTooLarge: boolean;
  throttle: number;
  setThrottle: (n: number) => void;
}

const DashContext = createContext<DashContextValue | null>(null);

export function useDash(): DashContextValue {
  const ctx = useContext(DashContext);
  if (!ctx) throw new Error("useDash must be used within <DashProvider>");
  return ctx;
}

export function DashProvider({ children }: { children: React.ReactNode }) {
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [verifyingIds, setVerifyingIds] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [signature, setSignature] = useState(DEFAULT_SIGNATURE);
  const [sender, setSender] = useState<SenderInfo>({ ...DEFAULT_SENDER });
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [throttle, setThrottle] = useState(DEFAULT_THROTTLE_SECONDS);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [trackError, setTrackError] = useState("");

  const professorsRef = useRef(professors);
  professorsRef.current = professors;
  const loaded = useRef(false);

  // ---- Persistence ------------------------------------------------------
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (Array.isArray(d.professors)) {
          setProfessors(
            d.professors.map(
              (p: Professor): Professor => ({
                ...p,
                // Reset transient run state on reload.
                status:
                  p.status === "sent"
                    ? "sent"
                    : p.hook && p.hook.trim()
                    ? "ready"
                    : "idle",
                statusMessage: undefined,
              })
            )
          );
        }
        if (typeof d.subject === "string") setSubject(d.subject);
        if (typeof d.body === "string") setBody(d.body);
        if (typeof d.signature === "string") setSignature(d.signature);
        if (d.sender && typeof d.sender === "object") setSender(d.sender);
        if (typeof d.throttle === "number") setThrottle(d.throttle);
      }
    } catch {
      // ignore corrupt storage
    }
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ professors, subject, body, signature, sender, throttle })
      );
    } catch {
      // ignore quota errors
    }
  }, [professors, subject, body, signature, sender, throttle]);

  // ---- Mutations --------------------------------------------------------
  const updateProf = useCallback((id: string, partial: Partial<Professor>) => {
    setProfessors((prev) => prev.map((p) => (p.id === id ? { ...p, ...partial } : p)));
  }, []);

  const runVerification = useCallback(async (targets: Professor[]) => {
    if (targets.length === 0) return;
    const ids = targets.map((p) => p.id);
    setVerifyingIds((prev) => new Set([...Array.from(prev), ...ids]));
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: targets.map((p) => p.email) }),
      });
      const data = await res.json();
      const byEmail = new Map<string, VerificationResult>();
      if (Array.isArray(data.results)) {
        for (const r of data.results as VerificationResult[]) byEmail.set(r.email, r);
      }
      setProfessors((prev) =>
        prev.map((p) => {
          if (!ids.includes(p.id)) return p;
          const v = byEmail.get(p.email);
          if (!v) return p;
          const selected = v.status === "invalid" ? false : p.selected;
          return { ...p, verification: v, selected };
        })
      );
    } catch {
      // leave unverified
    } finally {
      setVerifyingIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    }
  }, []);

  const addSeeds = useCallback(
    (seeds: ProfessorSeed[]): number => {
      const existing = new Set(professorsRef.current.map((p) => p.email));
      const seen = new Set<string>();
      const fresh: Professor[] = [];
      for (const seed of seeds) {
        const email = seed.email.trim().toLowerCase();
        if (!email.includes("@")) continue;
        if (existing.has(email) || seen.has(email)) continue;
        seen.add(email);
        fresh.push({
          id: uid(),
          name: seed.name.trim(),
          email,
          university: seed.university.trim(),
          department: seed.department.trim(),
          area: seed.area.trim(),
          researchDetail: seed.researchDetail.trim(),
          hook: "",
          selected: true,
          status: "idle",
        });
      }
      if (fresh.length > 0) {
        setProfessors((prev) => [...prev, ...fresh]);
        void runVerification(fresh);
      }
      return fresh.length;
    },
    [runVerification]
  );

  const setSelected = useCallback(
    (id: string, selected: boolean) => updateProf(id, { selected }),
    [updateProf]
  );

  const setManySelected = useCallback((ids: string[], selected: boolean) => {
    const set = new Set(ids);
    setProfessors((prev) =>
      prev.map((p) => (set.has(p.id) ? { ...p, selected } : p))
    );
  }, []);

  const removeProfessor = useCallback((id: string) => {
    setProfessors((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const editHook = useCallback((id: string, value: string) => {
    setProfessors((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        if (p.status === "sent" || p.status === "sending") return { ...p, hook: value };
        return { ...p, hook: value, status: value.trim() ? "ready" : "idle" };
      })
    );
  }, []);

  const clearAll = useCallback(() => setProfessors([]), []);

  const generateHook = useCallback(
    async (id: string) => {
      const p = professorsRef.current.find((x) => x.id === id);
      if (!p) return;
      updateProf(id, { status: "generating", statusMessage: undefined });
      try {
        const res = await fetch("/api/generate-hook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: p.name,
            university: p.university,
            area: p.area,
            researchDetail: p.researchDetail,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Hook generation failed.");
        const hook = (data.hook || "").trim();
        updateProf(id, { hook, status: hook ? "ready" : "idle" });
      } catch (e: any) {
        updateProf(id, { status: "error", statusMessage: e?.message || "Failed." });
      }
    },
    [updateProf]
  );

  const generateHooksFor = useCallback(
    async (ids: string[]) => {
      const set = new Set(ids);
      const targets = professorsRef.current.filter(
        (p) =>
          set.has(p.id) &&
          !p.hook.trim() &&
          p.status !== "sent" &&
          p.status !== "sending" &&
          p.status !== "generating"
      );
      for (const t of targets) {
        // eslint-disable-next-line no-await-in-loop
        await generateHook(t.id);
      }
    },
    [generateHook]
  );

  const sendSelected = useCallback(async () => {
    const tpl = { subject, body, signature };
    const snd = sender;
    const att = attachment;
    const delayMs =
      Math.max(MIN_THROTTLE_SECONDS, throttle || MIN_THROTTLE_SECONDS) * 1000;
    const targets = professorsRef.current.filter(
      (p) => p.selected && p.status === "ready"
    );
    if (targets.length === 0) return;

    setSending(true);
    try {
      for (let i = 0; i < targets.length; i++) {
        const p = targets[i];
        updateProf(p.id, { status: "sending", statusMessage: undefined });
        const { subject: sub, body: bod } = buildEmail(
          p,
          snd,
          tpl.subject,
          tpl.body,
          tpl.signature
        );
        try {
          const res = await fetch("/api/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: p.email,
              subject: sub,
              body: bod,
              attachment: att || null,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Send failed.");
          updateProf(p.id, {
            status: "sent",
            statusMessage: undefined,
            threadId: data.threadId || undefined,
            sentAt: Date.now(),
            engagement: "no_reply",
            engagementInfo: undefined,
          });
        } catch (e: any) {
          updateProf(p.id, { status: "error", statusMessage: e?.message || "Send failed." });
        }
        if (i < targets.length - 1) {
          // eslint-disable-next-line no-await-in-loop
          await sleep(delayMs);
        }
      }
    } finally {
      setSending(false);
    }
  }, [subject, body, signature, sender, attachment, throttle, updateProf]);

  const checkResponses = useCallback(async () => {
    const items = professorsRef.current
      .filter((p) => p.status === "sent" && p.threadId)
      .map((p) => ({ email: p.email, threadId: p.threadId as string }));
    if (items.length === 0) {
      setTrackError("Nothing to check yet — send some emails first.");
      return;
    }
    setChecking(true);
    setTrackError("");
    try {
      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Tracking check failed.");
      const byEmail = new Map<string, EngagementResult>();
      for (const r of (data.results || []) as EngagementResult[]) {
        byEmail.set(r.email, r);
      }
      const now = Date.now();
      setProfessors((prev) =>
        prev.map((p) => {
          const r = byEmail.get(p.email);
          if (!r) return p;
          return {
            ...p,
            engagement: r.engagement,
            engagementInfo: r.info,
            engagementCheckedAt: now,
          };
        })
      );
    } catch (e: any) {
      setTrackError(e?.message || "Tracking check failed.");
    } finally {
      setChecking(false);
    }
  }, []);

  const attachmentTooLarge =
    !!attachment && attachment.contentBase64.length > MAX_BASE64_LEN;

  const value: DashContextValue = {
    professors,
    verifyingIds,
    addSeeds,
    updateProf,
    setSelected,
    setManySelected,
    removeProfessor,
    editHook,
    clearAll,
    generateHook,
    generateHooksFor,
    sendSelected,
    sending,
    checkResponses,
    checking,
    trackError,
    subject,
    setSubject,
    body,
    setBody,
    signature,
    setSignature,
    sender,
    setSender,
    attachment,
    setAttachment,
    attachmentTooLarge,
    throttle,
    setThrottle,
  };

  return <DashContext.Provider value={value}>{children}</DashContext.Provider>;
}
