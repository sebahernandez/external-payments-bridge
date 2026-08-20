import {DeliveryMethod} from '@shopify/shopify-api';
import {db} from './db.js';
import {createChargeForOrder} from './services/charges.js';
import {getFreshOfflineSession} from './services/offline-session.js';

// `payment_gateway_names` on the order payload is the merchant-facing name
// they gave their manual payment method (e.g. "Bank Deposit"), so it can't
// be matched by a fixed string. The REST transactions endpoint is the only
// place that exposes a stable, name-independent `manual_payment_gateway`
// flag, so we look the order back up rather than trust the webhook payload.
async function isManualPaymentOrder(shop: string, orderId: number): Promise<boolean> {
  const session = await getFreshOfflineSession(shop);
  if (!session?.accessToken) return false;

  const response = await fetch(
    `https://${shop}/admin/api/2025-07/orders/${orderId}/transactions.json`,
    {headers: {'X-Shopify-Access-Token': session.accessToken}},
  );
  if (!response.ok) {
    console.error(`Failed to fetch transactions for order ${orderId}: ${response.status}`);
    return false;
  }

  const {transactions} = (await response.json()) as {transactions: {manual_payment_gateway?: boolean}[]};
  return transactions.some((t) => t.manual_payment_gateway);
}

export const webhookHandlers = {
  ORDERS_CREATE: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: '/webhooks',
    callback: async (topic: string, shop: string, body: string, webhookId: string) => {
      const dedupe = await db.webhookEvent
        .create({
          data: {source: 'shopify', topic, shop, externalEventId: webhookId, payload: JSON.parse(body)},
        })
        .catch(() => null);
      if (!dedupe) return; // already processed

      const order = JSON.parse(body);
      if (!(await isManualPaymentOrder(shop, order.id))) {
        await db.webhookEvent.update({where: {id: dedupe.id}, data: {status: 'IGNORED', processedAt: new Date()}});
        return;
      }

      await createChargeForOrder({shop, order});
      await db.webhookEvent.update({where: {id: dedupe.id}, data: {status: 'PROCESSED', processedAt: new Date()}});
    },
  },
  APP_UNINSTALLED: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: '/webhooks',
    callback: async (_topic: string, shop: string) => {
      await db.merchantPaymentConfig.deleteMany({where: {shop}});
      await db.session.deleteMany({where: {shop}});
    },
  },
};
