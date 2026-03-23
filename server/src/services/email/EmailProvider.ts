export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

export interface SendResult {
  messageId: string;
  provider: string;
}

export interface EmailProvider {
  send(options: EmailOptions): Promise<SendResult>;
  verifyConnection(): Promise<boolean>;
}
