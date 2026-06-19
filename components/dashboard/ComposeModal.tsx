"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import s from "./styles.module.css";
import { useDash } from "@/lib/dash-store";
import { buildEmail } from "@/lib/merge";
import { MIN_THROTTLE_SECONDS } from "@/lib/template";
import type { Professor, SendStatus } from "@/lib/types";

const MAX_BASE64_LEN = 4 * 1024 * 1024;

function StatusPill({ status }: { status: SendStatus }) {
  const map: Record<SendStatus, string> = {
    idle: "pill-gray",
    generating: "pill-blue",
    ready: "pill-amber",
    sending: "pill-blue",
    sent: "pill-green",
    error: "pill-red",
  };
  const label: Record<SendStatus, string> = {
    idle: "queued",
    generating: "generating…",
    ready: "ready",
    sending: "sending…",
    sent: "sent",
    error: "error",
  };
  return <span className={`pill ${map[status]}`}>{label[status]}</span>;
}

export default function ComposeModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    professors,
    subject,
    setSubject,
    body,
    setBody,
    signature,
    setSignature,
    sender,
    attachment,
    setAttachment,
    attachmentTooLarge,
    throttle,
    setThrottle,
    sending,
    generateHooksFor,
    editHook,
    generateHook,
    sendSelected,
  } = useDash();

  const selected = useMemo(
    () => professors.filter((p) => p.selected),
    [professors]
  );

  const [previewId, setPreviewId] = useState<string>("");
  const [attachError, setAttachError] = useState("");
  const [confirmNoResume, setConfirmNoResume] = useState(false);
  const [sendError, setSendError] = useState("");
  const autoRan = useRef(false);

  // Auto-generate hooks for selected professors once when the modal opens.
  useEffect(() => {
    if (open && !autoRan.current) {
      autoRan.current = true;
      void generateHooksFor(selected.map((p) => p.id));
    }
    if (!open) {
      autoRan.current = false;
      setSendError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const previewProf =
    selected.find((p) => p.id === previewId) || selected[0] || null;
  const preview = previewProf
    ? buildEmail(previewProf, sender, subject, body, signature)
    : null;

  const readyCount = selected.filter((p) => p.status === "ready").length;
  const sentCount = selected.filter((p) => p.status === "sent").length;

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setAttachError("");
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setAttachError("Please choose a PDF file.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : "";
      if (!base64) {
        setAttachError("Could not read that PDF. Try a different file.");
        return;
      }
      if (base64.length > MAX_BASE64_LEN) {
        setAttachError(
          "This PDF is large (over ~3MB) and may exceed the serverless request limit — sends could fail. Compress it first."
        );
      }
      setAttachment({ filename: file.name, contentBase64: base64 });
    };
    reader.onerror = () => setAttachError("Could not read that file.");
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function handleSend() {
    setSendError("");
    if (attachmentTooLarge) {
      setSendError("The attached resume is too large to send reliably. Compress it under ~3MB.");
      return;
    }
    if (readyCount === 0) {
      setSendError("No professors are ready yet — wait for hooks to finish generating.");
      return;
    }
    if (!attachment && !confirmNoResume) {
      setSendError(
        "No resume attached — every email references an attached resume. Attach a PDF, or tick the box to send without one."
      );
      return;
    }
    await sendSelected();
  }

  return (
    <div className={s.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={s.modal} role="dialog" aria-modal="true">
        <div className={s.modalHead}>
          <div>
            <h2 className={s.modalTitle}>Draft &amp; send</h2>
            <p className={s.modalSub}>
              {selected.length} professor{selected.length === 1 ? "" : "s"} selected ·{" "}
              {readyCount} ready · {sentCount} sent
            </p>
          </div>
          <button className={s.closeBtn} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={s.modalBody}>
          {/* Resume */}
          <section className={s.block}>
            <h3 className={s.blockTitle}>Resume attachment</h3>
            <p className={s.hint}>
              A PDF is attached to <strong>every</strong> email as a real downloadable
              file.
            </p>
            <div className={s.attachRow}>
              <label className="btn btn-ghost">
                {attachment ? "Replace PDF" : "Choose PDF"}
                <input
                  type="file"
                  accept="application/pdf"
                  className={s.fileInput}
                  onChange={handleFile}
                />
              </label>
              {attachment && (
                <span className={s.chip}>
                  Attached: {attachment.filename}
                  <button
                    className={s.chipRemove}
                    onClick={() => setAttachment(null)}
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </span>
              )}
            </div>
            {attachError && <div className={s.warn}>{attachError}</div>}
            {!attachment && (
              <div className={s.warn}>
                No resume attached — every email references an attached resume.{" "}
                <label className={s.inlineCheck}>
                  <input
                    type="checkbox"
                    checked={confirmNoResume}
                    onChange={(e) => setConfirmNoResume(e.target.checked)}
                  />
                  Send without a resume anyway
                </label>
              </div>
            )}
          </section>

          {/* Template + preview */}
          <section className={s.block}>
            <div className={s.composeGrid}>
              <div>
                <h3 className={s.blockTitle}>Template</h3>
                <div className={s.field}>
                  <label className={s.label}>Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Body</label>
                  <textarea rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Signature</label>
                  <textarea
                    rows={3}
                    value={signature}
                    onChange={(e) => setSignature(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <h3 className={s.blockTitle}>Live preview</h3>
                <div className={s.field}>
                  <label className={s.label}>Preview for</label>
                  <select
                    value={previewProf?.id || ""}
                    onChange={(e) => setPreviewId(e.target.value)}
                  >
                    {selected.length === 0 && <option value="">No professors selected</option>}
                    {selected.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.email}
                      </option>
                    ))}
                  </select>
                </div>
                {preview ? (
                  <div className={s.previewBox}>
                    <div className={s.previewSubject}>
                      <span className={s.subjLabel}>Subject</span>
                      {preview.subject}
                    </div>
                    <div className={s.previewBody}>{preview.body}</div>
                  </div>
                ) : (
                  <div className={s.previewEmpty}>Select professors to preview.</div>
                )}
              </div>
            </div>
          </section>

          {/* Per-professor list */}
          <section className={s.block}>
            <h3 className={s.blockTitle}>Selected professors &amp; hooks</h3>
            <div className={s.profList}>
              {selected.map((p) => (
                <ComposeRow key={p.id} p={p} editHook={editHook} generateHook={generateHook} />
              ))}
              {selected.length === 0 && (
                <div className={s.previewEmpty}>Nothing selected.</div>
              )}
            </div>
          </section>
        </div>

        <div className={s.modalFooter}>
          <div className={s.footerLeft}>
            <label className={s.label}>Throttle (sec, min {MIN_THROTTLE_SECONDS})</label>
            <input
              type="number"
              min={MIN_THROTTLE_SECONDS}
              value={throttle}
              onChange={(e) => setThrottle(Number(e.target.value))}
              className={s.throttleInput}
            />
          </div>
          <div className={s.footerRight}>
            {sendError && <span className={s.footerError}>{sendError}</span>}
            <a className="btn btn-ghost btn-sm" href="/api/auth" target="_blank" rel="noreferrer">
              Connect Gmail
            </a>
            <button
              className="btn btn-primary"
              onClick={handleSend}
              disabled={sending || readyCount === 0}
            >
              {sending ? "Sending…" : `Send ${readyCount} ready`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ComposeRow({
  p,
  editHook,
  generateHook,
}: {
  p: Professor;
  editHook: (id: string, v: string) => void;
  generateHook: (id: string) => Promise<void>;
}) {
  return (
    <div className={s.profItem}>
      <div className={s.profItemHead}>
        <div>
          <span className={s.profItemName}>{p.name}</span>
          <span className={s.profItemEmail}>{p.email}</span>
        </div>
        <StatusPill status={p.status} />
      </div>
      <textarea
        className={s.hookArea}
        rows={2}
        placeholder="One-sentence hook…"
        value={p.hook}
        onChange={(e) => editHook(p.id, e.target.value)}
      />
      <div className={s.profItemActions}>
        <button
          className="btn btn-light btn-sm"
          onClick={() => generateHook(p.id)}
          disabled={p.status === "generating" || p.status === "sending"}
        >
          {p.status === "generating" ? "Generating…" : p.hook ? "Regenerate" : "Generate hook"}
        </button>
        {p.status === "error" && p.statusMessage && (
          <span className={s.rowError}>{p.statusMessage}</span>
        )}
      </div>
    </div>
  );
}
