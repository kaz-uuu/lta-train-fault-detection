import { ApiError } from "../api/client";
import type { components } from "../api/schema";

type Schemas = components["schemas"];

export type SubsystemInfo = Schemas["SubsystemInfo"];
export type SubsystemId = SubsystemInfo["id"];
export type ModelCard = Schemas["ModelCard"];
export type Run = Schemas["Run"];
export type RunSummary = Schemas["RunSummary"];
export type RunStatus = RunSummary["status"];
export type FileResult = Schemas["FileResult"];
export type Check = Schemas["Check"];
export type DoorView = Schemas["DoorView"];
export type DoorCycle = Schemas["DoorCycle"];
export type DoorReference = Schemas["DoorReference"];
export type AcvView = Schemas["AcvView"];
export type AcvCar = Schemas["AcvCar"];
export type RailView = Schemas["RailView"];
export type RailChannel = Schemas["RailChannel"];
export type ShmView = Schemas["ShmView"];
export type Submission = Schemas["Submission"];
export type SubmissionItem = Schemas["SubmissionItem"];

export const SUBSYSTEM_IDS: readonly SubsystemId[] = ["door", "acv", "rail", "shm"];

export const isSubsystem = (value: string | undefined): value is SubsystemId =>
  SUBSYSTEM_IDS.includes(value as SubsystemId);

/** Short names for tabs, where the full name would crowd the bar. */
export const SHORT_NAMES: Record<SubsystemId, string> = {
  door: "Doors",
  acv: "Air-con",
  rail: "Rail",
  shm: "Structure",
};

async function call<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(`/api/ps3${path}`, {
    ...rest,
    body: json === undefined ? rest.body : JSON.stringify(json),
    headers: json === undefined ? rest.headers : { "content-type": "application/json", ...rest.headers },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : detail;
    } catch {
      /* body wasn't json */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export const bench = {
  subsystems: () => call<SubsystemInfo[]>("/subsystems"),
  subsystem: (id: SubsystemId) => call<SubsystemInfo>(`/subsystems/${id}`),
  createRun: (subsystem: SubsystemId) => call<Run>("/runs", { method: "POST", json: { subsystem } }),
  run: (id: string) => call<Run>(`/runs/${encodeURIComponent(id)}`),
  upload: (runId: string, file: File) => {
    const body = new FormData();
    body.append("file", file, file.name);
    return call<FileResult>(`/runs/${encodeURIComponent(runId)}/files`, { method: "POST", body });
  },
  submission: () => call<Submission>("/submission"),
};
