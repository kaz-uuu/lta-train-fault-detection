import { useEffect, useRef, useState } from "react";
import { bench } from "../workbench/api";
import s from "./Assistant.module.css";
import { AssistantRunPicker } from "./AssistantRunPicker";

type Recommendation = { id: string; urgency: string; suspected_issue: string; next_action: string; evidence_ids: string[]; limitations: string[]; status: string };
type Reply = { text: string; provider: string; trace: { id: string; data: unknown }[]; recommendation: Recommendation | null };
type Exchange = { id: string; question: string; mode: string; runId: string | null; reply?: Reply; error?: string };
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
  const [runsLoading, setRunsLoading] = useState(false);
  const [text, setText] = useState("");
  const [items, setItems] = useState<Exchange[]>([]);
  const inFlight = useRef(false);
  const conversationEnd = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [engineer, setEngineer] = useState("");
  const [note, setNote] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) {
      dialog.current?.showModal();
    } else { dialog.current?.close(); }
  }, [open]);
  useEffect(() => {
    if (!open || mode !== "investigate") return;
    let cancelled = false;
    setRunsLoading(true);
      bench.subsystems().then(async data => {
        const ready = data.filter(x => x.latestRun?.status === "ready");
        const details = await Promise.all(ready.map(async subsystem => {
          const run = await bench.run(subsystem.latestRun!.id);
          const files = run.results.map(result => result.fileName).slice(0, 2).join(", ");
          const remainder = run.results.length > 2 ? ` +${run.results.length - 2} more` : "";
          return { id: run.id, name: `${subsystem.name} — ${files || "predictions ready"}${remainder}` };
        }));
        if (!cancelled) { setRuns(details); setRunId(current => details.some(run => run.id === current) ? current : ""); }
      }).catch(() => { if (!cancelled) setError("Could not retrieve prediction runs. Check the backend connection."); })
        .finally(() => { if (!cancelled) setRunsLoading(false); });
    return () => { cancelled = true; };
  }, [open, mode]);
  useEffect(() => { if (open && items.length) conversationEnd.current?.scrollIntoView({ block: "nearest" }); }, [items, open]);
  function close() { setOpen(false); launcher.current?.focus(); }
  async function send(retry?: Exchange) {
    const question = retry?.question ?? text.trim();
    if (!question || inFlight.current || (!retry && mode === "investigate" && (!runId || runsLoading))) return;
    const entry: Exchange = retry ? { ...retry, error: undefined } : { id: crypto.randomUUID(), question, mode, runId: mode === "investigate" ? runId : null };
    inFlight.current = true;
    if (!retry) setText("");
    setItems(previous => retry ? previous.map(item => item.id === retry.id ? entry : item) : [...previous, entry]);
    setBusy(true); setError("");
    try {
      let sessionId = sid;
      if (!sessionId) { const session = await request<{ id: string }>("/sessions", {}); sessionId = session.id; setSid(sessionId); }
      const reply = await request<Reply>(`/sessions/${sessionId}/messages`, { text: question, mode: entry.mode, run_id: entry.runId });
      setItems(previous => previous.map(item => item.id === entry.id ? { ...item, reply } : item));
    } catch (e) { setItems(previous => previous.map(item => item.id === entry.id ? { ...item, error: e instanceof Error ? e.message : "The assistant is unavailable." } : item)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function review(id: string, decision: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError("");
    try {
      const recommendation = await request<Recommendation>(`/sessions/${sid}/recommendations/${id}/review`, { decision, engineer, note });
      setItems(previous => previous.map(item => item.reply?.recommendation?.id === id ? { ...item, reply: { ...item.reply, recommendation } } : item));
    } catch (e) { setError(e instanceof Error ? e.message : "Review could not be saved."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <>
    <button className={s.launcher} ref={launcher} onClick={() => setOpen(true)}>Ask Thomas ↗</button>
    <dialog className={s.panel} ref={dialog} onCancel={close} aria-labelledby="assistant-title">
      <header className={s.header}><div><small>AI-assisted maintenance guidance</small><h2 id="assistant-title">Thomas, maintenance assistant</h2><p>Recommendations require engineer review before action.</p></div><button onClick={close} aria-label="Close assistant">×</button></header>
      <div className={s.body}>
        <p>Hi, I'm Thomas! I read the model results, sensor clues and maintenance notes so you do not have to play spreadsheet detective. Ask me anything about the app, or let me investigate a prediction.</p>
        <div className={s.controls}>
          <button aria-pressed={mode === "chat"} onClick={() => setMode("chat")}>Ask a question</button>
          <button aria-pressed={mode === "investigate"} onClick={() => setMode("investigate")}>Investigate a result</button>
        </div>
        {mode === "investigate" && <AssistantRunPicker options={runs} value={runId} loading={runsLoading} onChange={setRunId} />}
        {!items.length && <div className={s.empty}><h3>{mode === "chat" ? "What should we look at?" : "Investigate a prediction"}</h3><p>{mode === "chat" ? "Ask about uploads, predictions, model meaning, downloads, or maintenance concepts." : "Select a result. Thomas gathers available evidence, proposes a next step, and waits for engineer review."}</p>{mode === "chat" && <div className={s.controls}><button onClick={() => setText("How do I upload data and download predictions?")}>How does this app work?</button><button onClick={() => setText("What do the four models predict?")}>Explain the models</button></div>}</div>}
        <div role="log" aria-label="Assistant conversation" aria-live="polite">{items.map(item => <section className={s.exchange} key={item.id}>
          <div className={s.userMessage}><small>You</small><p>{item.question}</p></div>
          {!item.reply && !item.error && <p role="status">Thomas is preparing a response...</p>}
          {item.error && <div><p role="alert">{item.error}</p><button disabled={busy} onClick={() => void send(item)}>Retry</button></div>}
          {item.reply && <><small>{item.reply.provider === "vertex" ? "Gemini · Google Cloud" : "Offline guide · no AI generation"}</small><p className={s.answer}>{item.reply.text}</p>
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
              <div className={s.controls}>{["approved", "rejected"].map(decision => <button key={decision} disabled={busy || !engineer.trim() || !note.trim()} onClick={() => review(item.reply!.recommendation!.id, decision)}>{decision === "approved" ? "Approve recommendation" : "Reject recommendation"}</button>)}</div>
            </>}
            <p><small>Records your review only. No work order, train control or schedule change is executed. Reviewer identity is self-declared in this prototype.</small></p>
          </div>}</>}
        </section>)}<div ref={conversationEnd} /></div>
        {error && <p role="alert">{error}</p>}
      </div>
      <form className={s.composer} onSubmit={e => { e.preventDefault(); void send(); }}>
        <label htmlFor="assistant-message">{mode === "chat" ? "Your question" : "Investigation request"}</label>
        <textarea id="assistant-message" value={text} maxLength={2000} onChange={e => setText(e.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} placeholder={mode === "chat" ? "Ask Thomas about this application or a general topic..." : "Ask Thomas to review this result and recommend the next step..."} />
        <div className={s.controls}><button disabled={busy || !text.trim() || (mode === "investigate" && (!runId || runsLoading))} type="submit">{mode === "chat" ? "Send question" : "Start investigation"}</button><button type="button" disabled={busy} onClick={() => { setSid(""); setItems([]); setError(""); }}>New conversation</button></div>
      </form>
    </dialog>
  </>;
}
