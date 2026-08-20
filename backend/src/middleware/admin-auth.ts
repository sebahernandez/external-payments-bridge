import type {Request, Response, NextFunction} from 'express';
import {shopify} from '../shopify.js';
import {db} from '../db.js';
import {exchangeIdTokenForOfflineToken} from '../utils/token-exchange.js';
import {getFreshOfflineSession} from '../services/offline-session.js';

// Admin UI extensions (app-home) run in a Web Worker with a null origin, so
// responses need an explicit wildcard CORS header, and preflight OPTIONS
// requests must be answered directly.
export function adminCors(req: Request, res: Response, next: NextFunction) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}

// This app uses Shopify managed installation, not the classic OAuth redirect
// flow, so there's no /auth callback that hands us an offline token. Instead,
// every authenticated request from app-home already carries a fresh session
// token — we trade that for an offline token via Token Exchange the first
// time we see a shop. getFreshOfflineSession() covers reuse-and-refresh for
// everyone else (webhooks, the public /pay confirm action) since only this
// function has a live session token to bootstrap a brand new session from.
async function ensureOfflineSession(shop: string, sessionToken: string) {
  const existing = await getFreshOfflineSession(shop);
  if (existing) return existing;

  const id = shopify.session.getOfflineId(shop);
  const exchanged = await exchangeIdTokenForOfflineToken(shop, sessionToken);
  return db.session.upsert({
    where: {id},
    create: {
      id,
      shop,
      state: '',
      isOnline: false,
      scope: exchanged.scope,
      accessToken: exchanged.accessToken,
      refreshToken: exchanged.refreshToken,
      expires: exchanged.expiresAt,
    },
    update: {
      scope: exchanged.scope,
      accessToken: exchanged.accessToken,
      refreshToken: exchanged.refreshToken,
      expires: exchanged.expiresAt,
    },
  });
}

export async function shopFromRequest(req: Request): Promise<string> {
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const payload = await shopify.session.decodeSessionToken(token);
  const shop = payload.dest.replace(/^https?:\/\//, '');
  await ensureOfflineSession(shop, token);
  return shop;
}
