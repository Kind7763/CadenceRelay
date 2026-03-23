import { Worker, Job } from 'bullmq';
import { config } from '../config';
import { logger } from '../utils/logger';
import { processSnsEvent } from '../controllers/webhooks.controller';

interface EventJobData {
  notificationType: string;
  message: Record<string, unknown>;
}

export function startEventProcessingWorker(): Worker {
  const worker = new Worker<EventJobData>(
    'event-processing',
    async (job: Job<EventJobData>) => {
      const { notificationType, message } = job.data;

      logger.info('Processing SNS event', { type: notificationType, jobId: job.id });

      await processSnsEvent(notificationType, message);

      logger.debug('SNS event processed', { type: notificationType });
    },
    {
      connection: { url: config.redis.url },
      concurrency: 5,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error(`Event processing failed: ${err.message}`, { jobId: job?.id });
  });

  return worker;
}
