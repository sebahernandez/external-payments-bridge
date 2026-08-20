import {Router, json} from 'express';
import {db} from '../db.js';
import {encrypt} from '../utils/crypto.js';
import {adminCors, shopFromRequest} from '../middleware/admin-auth.js';

export const merchantConfigRouter = Router();
merchantConfigRouter.use(adminCors);
merchantConfigRouter.use(json());

merchantConfigRouter.get('/api/merchant-config', async (req, res) => {
  try {
    const shop = await shopFromRequest(req);
    const config = await db.merchantPaymentConfig.findUnique({where: {shop}});
    res.json({providerId: config?.providerId ?? null, isActive: config?.isActive ?? false});
  } catch (error) {
    console.error('GET /api/merchant-config auth failed:', error);
    res.status(401).json({error: 'Token de sesión inválido'});
  }
});

merchantConfigRouter.put('/api/merchant-config', async (req, res) => {
  try {
    const shop = await shopFromRequest(req);
    const {providerId, credentials} = req.body as {providerId: string; credentials: Record<string, string>};

    const encryptedCredentials = encrypt(JSON.stringify(credentials));

    await db.merchantPaymentConfig.upsert({
      where: {shop},
      create: {shop, providerId, credentials: encryptedCredentials, isActive: true},
      update: {providerId, credentials: encryptedCredentials, isActive: true},
    });

    res.json({ok: true});
  } catch (error) {
    console.error('PUT /api/merchant-config auth failed:', error);
    res.status(401).json({error: 'Token de sesión inválido'});
  }
});
