import { Router } from 'express';
import { requireAuth, requireRole } from '../auth';
import { wrap } from '../http';
import {
  approveRequest, createMember, createRequests, declineRequest, listAvailableDays, listMembers, listRequests, patchMember, withdrawRequest,
} from '../services/team';

export const teamRouter = Router();
teamRouter.use(requireAuth);
const id = (v: string) => Number(v);

// Supervisor
teamRouter.get('/team/members', requireRole('supervisor'), wrap(async (req, res) => res.json(await listMembers(req.user!))));
teamRouter.post('/team/members', requireRole('supervisor'), wrap(async (req, res) => res.status(201).json({ member: await createMember(req.user!, req.body) })));
teamRouter.patch('/team/members/:id', requireRole('supervisor'), wrap(async (req, res) => res.json(await patchMember(req.user!, id(req.params.id), req.body))));
teamRouter.post('/team/requests', requireRole('supervisor'), wrap(async (req, res) => res.status(201).json(await createRequests(req.user!, req.body))));
teamRouter.delete('/team/requests/:id', requireRole('supervisor'), wrap(async (req, res) => res.json(await withdrawRequest(req.user!, id(req.params.id)))));

// Admin
teamRouter.get('/requests', requireRole('admin'), wrap(async (_req, res) => res.json(await listRequests())));
teamRouter.get('/requests/available-days', requireRole('admin'), wrap(async (_req, res) => res.json(await listAvailableDays())));
teamRouter.post('/requests/:id/approve', requireRole('admin'), wrap(async (req, res) => res.json(await approveRequest(req.user!, id(req.params.id), req.body))));
teamRouter.post('/requests/:id/decline', requireRole('admin'), wrap(async (req, res) => res.json(await declineRequest(req.user!, id(req.params.id), req.body))));
