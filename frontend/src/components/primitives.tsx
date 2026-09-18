import type { ReactNode } from "react";
import s from "./primitives.module.css";

/** Micro label over a value — the spec-sheet pair. */
export function Field({
  label,
  children,
  unit,
  mono,
}: {
  label: string;
  children: ReactNode;
  unit?: string;
  mono?: boolean;
}) {
  return (
    <div className={s.field}>
      <span className="micro">{label}</span>
      <span className={`${s.fieldValue} ${mono ? "mono" : ""}`}>
        {children}
        {unit && <span className={s.fieldUnit}>{unit}</span>}
      </span>
    </div>
  );
}

export function CodeChip({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return <span className={`${s.chip} ${strong ? s.chipStrong : ""}`}>{children}</span>;
}

export function Panel({
  title,
  aside,
  children,
  focal,
  bodyClass,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  focal?: boolean;
  bodyClass?: string;
}) {
  const body = (
    <>
      {(title || aside) && (
        <div className={s.panelHead}>
          {typeof title === "string" ? <span className="micro">{title}</span> : title}
          {aside}
        </div>
      )}
      <div className={bodyClass ?? s.panelBody}>{children}</div>
    </>
  );
  return (
    <section className={`${s.panel} ${focal ? s.reg : ""}`}>
      {focal ? <div className={s.regInner} style={{ position: "relative" }}>{body}</div> : body}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className={s.empty}>{children}</div>;
}
