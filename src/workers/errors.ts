/** Non-retryable failure; `reason` is stored on the job and shown to the user. */
export class PermanentJobError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "PermanentJobError";
  }
}

/** The lease was lost to another worker; the attempt must not write anything. */
export class LeaseLostError extends Error {
  constructor() {
    super("Lease lost");
    this.name = "LeaseLostError";
  }
}
