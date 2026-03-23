import nodemailer from 'nodemailer';
import { EmailProvider, EmailOptions, SendResult } from './EmailProvider';
import { logger } from '../../utils/logger';

interface GmailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
}

export class GmailProvider implements EmailProvider {
  private transporter: nodemailer.Transporter;
  private fromEmail: string;

  constructor(config: GmailConfig) {
    this.fromEmail = config.user;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: false,
      auth: {
        user: config.user,
        pass: config.pass,
      },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      rateDelta: 1000,
      rateLimit: 5,
    });
  }

  async send(options: EmailOptions): Promise<SendResult> {
    const mailOptions: nodemailer.SendMailOptions = {
      from: options.from || this.fromEmail,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo || this.fromEmail,
      headers: options.headers || {},
    };

    const info = await this.transporter.sendMail(mailOptions);
    logger.debug('Gmail: Email sent', { messageId: info.messageId, to: options.to });

    return {
      messageId: info.messageId,
      provider: 'gmail',
    };
  }

  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      logger.info('Gmail: SMTP connection verified');
      return true;
    } catch (error) {
      logger.error('Gmail: SMTP connection failed', { error: (error as Error).message });
      return false;
    }
  }
}
