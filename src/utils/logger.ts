type Fields = Record<string, unknown>;

function write(level: "info" | "warn" | "error", msg: string, fields?: Fields): void {
  const line = JSON.stringify({ level, msg, ...fields }) + "\n";
  if (level === "error") process.stderr.write(line);
  else process.stdout.write(line);
}

export const logger = {
  info: (msg: string, fields?: Fields): void => write("info", msg, fields),
  warn: (msg: string, fields?: Fields): void => write("warn", msg, fields),
  error: (msg: string, fields?: Fields): void => write("error", msg, fields),
};
