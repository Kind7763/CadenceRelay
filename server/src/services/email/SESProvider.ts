import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { EmailProvider, EmailOptions, SendResult } from './EmailProvider';
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

    const response = await this.client.send(command);
    const messageId = response.MessageId || '';

    logger.debug('SES: Email sent', { messageId, to: options.to });

    return {
      messageId,
      provider: 'ses',
    };
  }

  async verifyConnection(): Promise<boolean> {
    try {
      // Simple connectivity test - list verified identities
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
