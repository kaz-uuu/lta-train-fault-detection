import { useEffect, useId, useRef, useState } from "react";
import s from "./Assistant.module.css";

export function AssistantRunPicker({ options, value, loading, onChange }: {
  options: { id: string; name: string }[]; value: string; loading: boolean; onChange: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setExpanded(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  useEffect(() => { root.current?.querySelector(`[id="${id}-${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active, expanded, id]);
  const open = () => { setActive(Math.max(0, options.findIndex(option => option.id === value))); setExpanded(true); };
  const select = () => { if (options[active]) onChange(options[active].id); setExpanded(false); };
  return <div className={s.picker} ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false); }}>
    <span id={`${id}-label`}>Prediction to investigate</span>
    <button type="button" role="combobox" aria-labelledby={`${id}-label`} aria-expanded={expanded} aria-controls={`${id}-list`} aria-haspopup="listbox" aria-activedescendant={expanded ? `${id}-${active}` : undefined}
      className={s.pickerButton} disabled={loading || !options.length} onClick={() => expanded ? setExpanded(false) : open()}
      onKeyDown={event => {
        if (event.key === "Escape" && expanded) { event.preventDefault(); event.stopPropagation(); setExpanded(false); }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          if (!expanded) { open(); return; }
          setActive(index => event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
        }
        if ((event.key === "Enter" || event.key === " ") && expanded) { event.preventDefault(); select(); }
      }}>
      <span>{loading ? "Loading uploaded results…" : options.find(option => option.id === value)?.name ?? (options.length ? "Choose an uploaded result" : "Upload data and generate predictions first")}</span><span aria-hidden>⌄</span>
    </button>
    {expanded && <ul id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} className={s.pickerList}>{options.map((option, index) =>
      <li key={option.id} id={`${id}-${index}`} role="option" aria-selected={value === option.id} className={`${s.pickerOption} ${active === index ? s.pickerActive : ""}`} onMouseEnter={() => setActive(index)} onPointerDown={event => event.preventDefault()} onClick={() => { onChange(option.id); setExpanded(false); }}>{option.name}</li>
    )}</ul>}
  </div>;
}
