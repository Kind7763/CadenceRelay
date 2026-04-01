import { Router } from 'express';
import {
  listProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
  toggleArchive,
  moveItems,
  unlinkItems,
} from '../controllers/projects.controller';
import { validateBody } from '../middleware/validateRequest';
import { z } from 'zod';

const router = Router();

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  color: z.string().max(20).optional(),
  icon: z.string().max(10).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  color: z.string().max(20).optional(),
  icon: z.string().max(10).optional(),
});

const moveSchema = z.object({
  campaignIds: z.array(z.string().uuid()).optional(),
  templateIds: z.array(z.string().uuid()).optional(),
  listIds: z.array(z.string().uuid()).optional(),
});

router.get('/', listProjects);
router.post('/', validateBody(createSchema), createProject);
router.get('/:id', getProject);
router.put('/:id', validateBody(updateSchema), updateProject);
router.delete('/:id', deleteProject);
router.put('/:id/archive', toggleArchive);
router.post('/:id/move', validateBody(moveSchema), moveItems);
router.post('/:id/unlink', validateBody(moveSchema), unlinkItems);

export default router;
