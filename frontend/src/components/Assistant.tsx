import { useEffect, useRef, useState } from "react";
import { bench } from "../workbench/api";
import s from "./Assistant.module.css";

type Recommendation = { id: string; urgency: string; suspected_issue: string; next_action: string; evidence_ids: string[]; limitations: string[]; status: string };
type Reply = { text: string; provider: string; trace: { id: string; data: unknown }[]; recommendation: Recommendation | null };
async function request<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/api/assistant${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  if (!response.ok) { const error = await response.json(); throw new Error(typeof error.detail === "string" ? error.detail : "Please check the form and retry."); }
  return response.json();
}

/** Reusable launcher; its placement can change independently of the panel. */
export function Assistant() {
  const [open, setOpen] = useState(false);
  const [sid, setSid] = useState("");
  const [mode, setMode] = useState("chat");
  const [runs, setRuns] = useState<{ id: string; name: string }[]>([]);
  const [runId, setRunId] = useState("");
  const [demo, setDemo] = useState(false);
  const [text, setText] = useState("");
  const [items, setItems] = useState<{ question: string; reply: Reply }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [engineer, setEngineer] = useState("");
  const [note, setNote] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) {
      dialog.current?.showModal();
      bench.subsystems().then(async data => {
        const ready = data.filter(x => x.latestRun?.status === "ready");
        const details = await Promise.all(ready.map(async subsystem => {
          const run = await bench.run(subsystem.latestRun!.id);
          const files = run.results.map(result => result.fileName).slice(0, 2).join(", ");
          const remainder = run.results.length > 2 ? ` +${run.results.length - 2} more` : "";
          return { id: run.id, name: `${subsystem.name} — ${files || "predictions ready"}${remainder}` };
        }));
        setRuns(details);
      }).catch(() => setError("Could not retrieve prediction runs. Check the backend connection."));
    } else { dialog.current?.close(); }
  }, [open]);
  function close() { setOpen(false); launcher.current?.focus(); }
  async function send() {
    if (!text.trim() || busy) return;
    const question = text.trim(); setBusy(true); setError("");
    try {
      let sessionId = sid;
      if (!sessionId) { const session = await request<{ id: string }>("/sessions", {}); sessionId = session.id; setSid(sessionId); }
      const reply = await request<Reply>(`/sessions/${sessionId}/messages`, { text: question, mode, run_id: runId || null, demo_context: demo });
      setItems(previous => [...previous, { question, reply }]); setText("");
    } catch (e) { setError(e instanceof Error ? e.message : "The assistant is unavailable."); }
    finally { setBusy(false); }
  }
  async function review(id: string, decision: string) {
    setBusy(true); setError("");
    try {
      const recommendation = await request<Recommendation>(`/sessions/${sid}/recommendations/${id}/review`, { decision, engineer, note });
      setItems(previous => previous.map(item => item.reply.recommendation?.id === id ? { ...item, reply: { ...item.reply, recommendation } } : item));
    } catch (e) { setError(e instanceof Error ? e.message : "Review could not be saved."); }
    finally { setBusy(false); }
  }
  return <>
    <button className={s.launcher} ref={launcher} onClick={() => setOpen(true)}>Assistant ↗</button>
    <dialog className={s.panel} ref={dialog} onCancel={close} aria-labelledby="assistant-title">
      <header className={s.header}><div><small>GoA-R · Recommend only</small><h2 id="assistant-title">Maintenance assistant</h2></div><button onClick={close} aria-label="Close assistant">×</button></header>
      <div className={s.body}>
        <p>Ask about the application or investigate a prediction. You review every recommended action.</p>
        <div className={s.controls}>
          <button aria-pressed={mode === "chat"} onClick={() => setMode("chat")}>Ask a question</button>
          <button aria-pressed={mode === "investigate"} onClick={() => setMode("investigate")}>Investigate a result</button>
        </div>
        {mode === "investigate" && <label>Prediction to investigate<select value={runId} onChange={e => setRunId(e.target.value)}><option value="">{runs.length ? "Choose an uploaded result" : "Upload data first to investigate"}</option>{runs.map(run => <option key={run.id} value={run.id}>{run.name}</option>)}</select></label>}
        {mode === "investigate" && <label><input type="checkbox" checked={demo} onChange={e => setDemo(e.target.checked)} /> Include fictional history and schedule for demonstration</label>}
        {!items.length && <div className={s.empty}><h3>From a result to a reviewed next step.</h3><p>Retrieve evidence → assess the issue → propose an action → engineer review.</p><button onClick={() => { setMode("chat"); setText("How do I upload data and download predictions?"); }}>How does this app work?</button></div>}
        <div aria-live="polite">{items.map((item, index) => <section className={s.exchange} key={index}>
          <small>You</small><p>{item.question}</p><small>{item.reply.provider === "vertex" ? "Gemini · Google Cloud" : "Offline guide · no AI generation"}</small><p className={s.answer}>{item.reply.text}</p>
          {item.reply.trace.length > 0 && <details><summary>Evidence retrieved · {item.reply.trace.length} sources</summary>{item.reply.trace.map((trace, i) => <details key={i}><summary>{trace.id.replaceAll("_", " ")}</summary><pre>{JSON.stringify(trace.data, null, 2)}</pre></details>)}</details>}
          {item.reply.recommendation && <div className={s.recommendation}>
            <small>Proposed urgency · {item.reply.recommendation.urgency.replaceAll("_", " ")}</small>
            <h3>Recommended next action</h3><p>{item.reply.recommendation.next_action}</p>
            <ul>{item.reply.recommendation.limitations.map((limit, i) => <li key={i}>{limit}</li>)}</ul>
            <p>Evidence: {item.reply.recommendation.evidence_ids.join(", ")}</p>
            <strong>Review: {item.reply.recommendation.status}</strong>
            {item.reply.recommendation.status === "pending" && <>
              <label>Engineer name<input value={engineer} maxLength={100} onChange={e => setEngineer(e.target.value)} /></label>
              <label>Review note<textarea value={note} maxLength={1000} onChange={e => setNote(e.target.value)} /></label>
              <div className={s.controls}>{["approved", "rejected"].map(decision => <button key={decision} disabled={busy || !engineer.trim() || !note.trim()} onClick={() => review(item.reply.recommendation!.id, decision)}>{decision === "approved" ? "Approve recommendation" : "Reject recommendation"}</button>)}</div>
            </>}
            <p><small>Records your review only. No work order, train control or schedule change is executed. Reviewer identity is self-declared in this prototype.</small></p>
          </div>}
        </section>)}</div>
        {busy && <p role="status">Retrieving evidence and preparing the response…</p>}
        {error && <p role="alert">{error}</p>}
      </div>
      <form className={s.composer} onSubmit={e => { e.preventDefault(); void send(); }}>
        <label htmlFor="assistant-message">{mode === "chat" ? "Your question" : "Investigation request"}</label>
        <textarea id="assistant-message" value={text} maxLength={2000} onChange={e => setText(e.target.value)} placeholder={mode === "chat" ? "Ask about this application or a general topic…" : "Review this result and recommend the next step…"} />
        <div className={s.controls}><button disabled={busy || !text.trim() || (mode === "investigate" && !runId)} type="submit">{mode === "chat" ? "Send question" : "Start investigation"}</button><button type="button" disabled={busy} onClick={() => { setSid(""); setItems([]); setError(""); }}>New conversation</button></div>
      </form>
    </dialog>
  </>;
}
