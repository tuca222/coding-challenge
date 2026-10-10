import { z } from "zod";

const positiveInt = (def: number): z.ZodDefault<z.ZodCoercedNumber> =>
  z.coerce.number().int().positive().default(def);

const schema = z.object({
  MONGO_URI: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  PORT: positiveInt(3000),
  JWT_EXPIRES_IN_SECONDS: positiveInt(3600),
  BCRYPT_COST: positiveInt(12),
  REPORT_MAX_ATTEMPTS: positiveInt(3),
  REPORT_LEASE_SECONDS: positiveInt(120),
  WORKER_POLL_INTERVAL_MS: positiveInt(2000),
  REPORTS_DIR: z.string().min(1).default("/tmp/reports"),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((i) => String(i.path[0])))];
    throw new Error(`Missing or invalid config: ${names.join(", ")}`);
  }
  return result.data;
}

function build(): Env {
  try {
    return loadEnv(process.env);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

export const env: Env = build();
