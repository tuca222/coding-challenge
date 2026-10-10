import { stat } from "node:fs/promises";
import { logger } from "../../utils/logger.js";
import type { EmailMessage, EmailSender } from "./EmailSender.js";

// Mock provider: this log line is the "recorded simulated email".
export class ConsoleEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    const file = await stat(message.attachment.path);
    logger.info("email sent", {
      jobId: message.jobId,
      to: message.to,
      subject: message.subject,
      attachment: message.attachment.filename,
      size: file.size,
    });
  }
}
