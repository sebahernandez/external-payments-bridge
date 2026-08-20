import {Session} from '@shopify/shopify-api';
import {db} from '../db.js';
import {shopify} from '../shopify.js';
import {refreshOfflineToken} from '../utils/token-exchange.js';

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

function toSession(row: {
  id: string;
  shop: string;
  state: string;
  isOnline: boolean;
  scope: string | null;
  expires: Date | null;
  accessToken: string;
}): Session {
  return new Session({
    id: row.id,
    shop: row.shop,
    state: row.state,
    isOnline: row.isOnline,
    scope: row.scope ?? undefined,
    expires: row.expires ?? undefined,
    accessToken: row.accessToken,
  });
}

// Shared by everything that needs to call the Admin API outside of a live
// dashboard request (webhooks, the public /pay confirm action): loads the
// stored offline session for a shop and refreshes it via the refresh_token
// grant if it's expired or close to it. Returns null if the shop has never
// completed Token Exchange at all (nothing to refresh).
export async function getFreshOfflineSession(shop: string): Promise<Session | null> {
  const id = shopify.session.getOfflineId(shop);
  const existing = await db.session.findUnique({where: {id}});
  if (!existing) return null;

  if (existing.expires && existing.expires.getTime() - Date.now() > REFRESH_MARGIN_MS) {
    return toSession(existing);
  }

  // Expired (or about to) and nothing to refresh with — the caller needs to
  // fall back to a brand new Token Exchange, which needs a live session
  // token this function doesn't have.
  if (!existing.refreshToken) return null;

  try {
    const refreshed = await refreshOfflineToken(shop, existing.refreshToken);
    const updated = await db.session.update({
      where: {id},
      data: {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        scope: refreshed.scope,
        expires: refreshed.expiresAt,
      },
    });
    return toSession(updated);
  } catch (error) {
    console.error(`Failed to refresh offline token for ${shop}:`, error);
    return null;
  }
}
