import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import {
  EmailProvider, EmailOptions, SendResult,
  PermanentBounceError, RateLimitError, AuthenticationError,
  TemporaryBounceError,
} from './EmailProvider';
import { logger } from '../../utils/logger';

interface SESConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fromEmail: string;
}

export class SESProvider implements EmailProvider {
  private client: SESClient;
  private fromEmail: string;

  constructor(config: SESConfig) {
    this.fromEmail = config.fromEmail;
    this.client = new SESClient({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async send(options: EmailOptions): Promise<SendResult> {
    const command = new SendEmailCommand({
      Source: options.from || this.fromEmail,
      Destination: {
        ToAddresses: [options.to],
      },
      Message: {
        Subject: {
          Data: options.subject,
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: options.html,
            Charset: 'UTF-8',
          },
          ...(options.text
            ? {
                Text: {
                  Data: options.text,
                  Charset: 'UTF-8',
                },
              }
            : {}),
        },
      },
      ReplyToAddresses: options.replyTo ? [options.replyTo] : undefined,
    });

    try {
      const response = await this.client.send(command);
      const messageId = response.MessageId || '';

      logger.debug('SES: Email sent', { messageId, to: options.to });

      return {
        messageId,
        provider: 'ses',
      };
    } catch (error: unknown) {
      const err = error as { name?: string; message: string; $metadata?: { httpStatusCode?: number } };
      const statusCode = err.$metadata?.httpStatusCode;

      // Classify SES errors
      if (err.name === 'MessageRejected') {
        // Could be blacklisted recipient, content policy violation, etc.
        if (err.message?.includes('Email address is not verified') ||
            err.message?.includes('not authorized')) {
          throw new AuthenticationError(`SES: ${err.message}`);
        }
        throw new PermanentBounceError(`SES rejected: ${err.message}`, 'MessageRejected', options.to);
      }

      if (err.name === 'Throttling' || statusCode === 429) {
        throw new RateLimitError(`SES rate limit: ${err.message}`);
      }

      if (err.name === 'AccountSendingPausedException') {
        throw new AuthenticationError(`SES account suspended: ${err.message}`);
      }

      if (err.name === 'InvalidParameterValue') {
        throw new PermanentBounceError(`SES invalid param: ${err.message}`, 'InvalidParam', options.to);
      }

      if (statusCode && statusCode >= 500) {
        throw new TemporaryBounceError(`SES service error: ${err.message}`, String(statusCode), options.to);
      }

      logger.error('SES: Unclassified send error', { error: err.message, name: err.name, statusCode });
      throw error;
    }
  }

  async verifyConnection(): Promise<boolean> {
    try {
      const { ListIdentitiesCommand } = await import('@aws-sdk/client-ses');
      await this.client.send(new ListIdentitiesCommand({ MaxItems: 1 }));
      logger.info('SES: Connection verified');
      return true;
    } catch (error) {
      logger.error('SES: Connection failed', { error: (error as Error).message });
      return false;
    }
  }
}
