export interface EmailMessage {
  jobId: string;
  to: string;
  subject: string;
  text: string;
  attachment: { filename: string; path: string };
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
