import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { bench, type FileResult, type SubsystemId } from "./api";

export function useSubsystems() {
  return useQuery({ queryKey: ["ps3", "subsystems"], queryFn: bench.subsystems });
}

export function useSubsystem(id: SubsystemId) {
  return useQuery({ queryKey: ["ps3", "subsystem", id], queryFn: () => bench.subsystem(id) });
}

export function useRun(id: string | undefined) {
  return useQuery({
    queryKey: ["ps3", "run", id],
    queryFn: () => bench.run(id!),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useSubmission() {
  return useQuery({ queryKey: ["ps3", "submission"], queryFn: bench.submission });
}

export interface QueueItem {
  key: string;
  name: string;
  size: number;
  state: "waiting" | "uploading" | "done" | "error";
  error?: string;
  result?: FileResult;
}

/**
 * Sends files one at a time so a batch of recordings shows progress file by file.
 * A run is created on the first upload when none is open; `onRun` reports its id.
 */
export function useUploader(subsystem: SubsystemId, runId: string | undefined, onRun: (id: string) => void) {
  const client = useQueryClient();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const running = useRef(false);
  const pending = useRef<{ key: string; file: File }[]>([]);
  const currentRun = useRef(runId);
  currentRun.current = runId;

  const patch = (key: string, change: Partial<QueueItem>) =>
    setQueue((items) => items.map((it) => (it.key === key ? { ...it, ...change } : it)));

  const drain = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      while (pending.current.length) {
        const { key, file } = pending.current.shift()!;
        patch(key, { state: "uploading" });
        try {
          if (!currentRun.current) {
            const run = await bench.createRun(subsystem);
            currentRun.current = run.id;
            onRun(run.id);
          }
          const result = await bench.upload(currentRun.current, file);
          patch(key, { state: "done", result });
          client.invalidateQueries({ queryKey: ["ps3", "run", currentRun.current] });
        } catch (err) {
          patch(key, { state: "error", error: err instanceof Error ? err.message : String(err) });
        }
      }
    } finally {
      running.current = false;
      client.invalidateQueries({ queryKey: ["ps3", "subsystems"] });
      client.invalidateQueries({ queryKey: ["ps3", "subsystem", subsystem] });
      client.invalidateQueries({ queryKey: ["ps3", "submission"] });
    }
  }, [client, onRun, subsystem]);

  const add = useCallback(
    (files: File[]) => {
      const stamp = Date.now();
      const items = files.map((file, i) => ({ key: `${stamp}-${i}-${file.name}`, file }));
      pending.current.push(...items);
      setQueue((q) => [
        ...q,
        ...items.map(({ key, file }) => ({ key, name: file.name, size: file.size, state: "waiting" as const })),
      ]);
      void drain();
    },
    [drain],
  );

  const clear = useCallback(() => {
    pending.current = [];
    setQueue([]);
  }, []);

  const busy = queue.some((q) => q.state === "waiting" || q.state === "uploading");
  return { queue, add, clear, busy };
}
