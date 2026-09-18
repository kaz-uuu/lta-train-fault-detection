/** Shared API error and the state vocabulary the marks and labels use. */

/** P1 train alarm · P2 early warning · P3 advisory · DQ data quality. `null` is normal. */
export type Priority = "P1" | "P2" | "P3" | "DQ";
/** Priorities plus the non-alarm "action required" state. */
export type State = Priority | "ACT" | null;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
