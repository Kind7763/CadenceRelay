import { runContactHealthCheck } from '../workers/contactHealthChecker';

export async function run(): Promise<void> {
  await runContactHealthCheck();
}
