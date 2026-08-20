import {Router, json} from 'express';
import {db} from '../db.js';
import {adminCors, shopFromRequest} from '../middleware/admin-auth.js';
import {confirmChargeAndMarkOrderPaid, rejectCharge} from '../services/charges.js';

const VALID_STATUSES = new Set([
  'PENDING',
  'PROCESSING',
  'PAID',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
  'NEEDS_REVIEW',
]);

export const chargesRouter = Router();
chargesRouter.use(adminCors);
chargesRouter.use(json());

const PAGE_SIZE = 20;

chargesRouter.get('/api/charges', async (req, res) => {
  try {
    const shop = await shopFromRequest(req);
    const statusParam = typeof req.query.status === 'string' ? req.query.status : undefined;
    const statuses = statusParam?.split(',').filter((s) => VALID_STATUSES.has(s));
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const page = Math.max(1, Number(req.query.page) || 1);

    const where = {
      shop,
      ...(statuses?.length ? {status: {in: statuses as any}} : {}),
      ...(search ? {shopifyOrderName: {contains: search, mode: 'insensitive' as const}} : {}),
    };

    const [charges, total] = await Promise.all([
      db.charge.findMany({
        where,
        orderBy: {createdAt: 'desc'},
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      db.charge.count({where}),
    ]);

    res.json({charges, page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE))});
  } catch (error) {
    console.error('GET /api/charges auth failed:', error);
    res.status(401).json({error: 'Token de sesión inválido'});
  }
});

// Must be registered before the /:id route below, or "summary" would be
// matched as a charge id.
chargesRouter.get('/api/charges/summary', async (req, res) => {
  try {
    const shop = await shopFromRequest(req);
    const groups = await db.charge.groupBy({
      by: ['status'],
      where: {shop},
      _count: {_all: true},
    });

    const countFor = (statuses: string[]) =>
      groups.filter((g) => statuses.includes(g.status)).reduce((sum, g) => sum + g._count._all, 0);

    res.json({
      total: groups.reduce((sum, g) => sum + g._count._all, 0),
      needsAction: countFor(['PENDING', 'NEEDS_REVIEW']),
      approved: countFor(['PAID']),
      rejected: countFor(['CANCELLED']),
      failed: countFor(['FAILED', 'EXPIRED']),
    });
  } catch (error) {
    console.error('GET /api/charges/summary auth failed:', error);
    res.status(401).json({error: 'Token de sesión inválido'});
  }
});

chargesRouter.get('/api/charges/:id', async (req, res) => {
  try {
    const shop = await shopFromRequest(req);
    const charge = await db.charge.findFirst({where: {id: req.params.id, shop}});
    if (!charge) {
      res.status(404).json({error: 'No encontrado'});
      return;
    }
    res.json({charge});
  } catch (error) {
    console.error('GET /api/charges/:id auth failed:', error);
    res.status(401).json({error: 'Token de sesión inválido'});
  }
});

chargesRouter.post('/api/charges/:id/approve', async (req, res) => {
  try {
    const shop = await shopFromRequest(req);
    const existing = await db.charge.findFirst({where: {id: req.params.id, shop}});
    if (!existing) {
      res.status(404).json({error: 'No encontrado'});
      return;
    }
    const {note} = req.body as {note?: string};
    const charge = await confirmChargeAndMarkOrderPaid(existing.id, note);
    res.json({charge});
  } catch (error) {
    console.error('POST /api/charges/:id/approve failed:', error);
    res.status(401).json({error: 'Token de sesión inválido'});
  }
});

chargesRouter.post('/api/charges/:id/reject', async (req, res) => {
  try {
    const shop = await shopFromRequest(req);
    const existing = await db.charge.findFirst({where: {id: req.params.id, shop}});
    if (!existing) {
      res.status(404).json({error: 'No encontrado'});
      return;
    }
    const {reason} = req.body as {reason?: string};
    if (!reason) {
      res.status(400).json({error: 'El motivo es obligatorio'});
      return;
    }
    const charge = await rejectCharge(existing.id, reason);
    res.json({charge});
  } catch (error) {
    console.error('POST /api/charges/:id/reject failed:', error);
    res.status(401).json({error: 'Token de sesión inválido'});
  }
});
