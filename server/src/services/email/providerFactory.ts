import { EmailProvider } from './EmailProvider';
import { GmailProvider } from './GmailProvider';
import { SESProvider } from './SESProvider';

export function createProvider(provider: string, config: Record<string, unknown>): EmailProvider {
  switch (provider) {
    case 'gmail':
      return new GmailProvider(config as { host: string; port: number; user: string; pass: string });
    case 'ses':
      return new SESProvider(
        config as { region: string; accessKeyId: string; secretAccessKey: string; fromEmail: string }
      );
    default:
      throw new Error(`Unknown email provider: ${provider}`);
  }
}
