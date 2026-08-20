import {db} from '../db.js';
import {shopify} from '../shopify.js';
import {getPaymentRail} from './payment-rails/registry.js';
import {getFreshOfflineSession} from './offline-session.js';

export async function createChargeForOrder({shop, order}: {shop: string; order: any}) {
  const merchantConfig = await db.merchantPaymentConfig.findUnique({where: {shop}});
  const providerId = merchantConfig?.providerId ?? 'manual-confirm';
  const rail = getPaymentRail(providerId);

  const shopifyOrderId = `gid://shopify/Order/${order.id}`;

  const charge = await db.charge.create({
    data: {
      shop,
      shopifyOrderId,
      shopifyOrderName: order.name,
      providerId,
      amount: order.total_price,
      currency: order.currency,
      status: 'PENDING',
    },
  });

  const result = await rail.createCharge({
    chargeId: charge.id,
    shopifyOrderId,
    orderName: order.name,
    amount: order.total_price,
    currency: order.currency,
  });

  return db.charge.update({
    where: {id: charge.id},
    data: {
      externalReference: result.externalReference,
      status: result.status,
      paymentInstructions: result.paymentInstructions as any,
      rawProviderPayload: result.raw as any,
    },
  });
}

async function getOfflineSession(shop: string) {
  const session = await getFreshOfflineSession(shop);
  if (!session) {
    throw new Error(`No hay una sesión offline utilizable para ${shop} — la app no completó el Token Exchange todavía`);
  }
  return session;
}

export async function confirmChargeAndMarkOrderPaid(chargeId: string, reviewNote?: string) {
  const charge = await db.charge.findUniqueOrThrow({where: {id: chargeId}});
  if (charge.status === 'PAID') return charge;

  const session = await getOfflineSession(charge.shop);
  const client = new shopify.clients.Graphql({session});

  const checkResponse = await client.request<{
    order: {
      id: string;
      canMarkAsPaid: boolean;
      displayFinancialStatus: string;
      totalOutstandingSet: {shopMoney: {amount: string; currencyCode: string}};
    } | null;
  }>(
    `#graphql
    query CheckOrder($id: ID!) {
      order(id: $id) {
        id
        canMarkAsPaid
        displayFinancialStatus
        totalOutstandingSet { shopMoney { amount currencyCode } }
      }
    }`,
    {variables: {id: charge.shopifyOrderId}},
  );

  const order = checkResponse.data?.order;
  if (!order || !order.canMarkAsPaid) {
    return db.charge.update({
      where: {id: chargeId},
      data: {
        status: 'NEEDS_REVIEW',
        errorMessage: `El pedido no se puede marcar como pagado (estado: ${order?.displayFinancialStatus ?? 'desconocido'})`,
      },
    });
  }

  if (Number(order.totalOutstandingSet.shopMoney.amount) !== Number(charge.amount)) {
    return db.charge.update({
      where: {id: chargeId},
      data: {status: 'NEEDS_REVIEW', errorMessage: 'El monto no coincide entre el cobro y el pedido de Shopify'},
    });
  }

  const markPaidResponse = await client.request<{
    orderMarkAsPaid: {
      userErrors: {field: string[]; message: string}[];
      order: {id: string; displayFinancialStatus: string} | null;
    };
  }>(
    `#graphql
    mutation MarkPaid($input: OrderMarkAsPaidInput!) {
      orderMarkAsPaid(input: $input) {
        userErrors { field message }
        order { id displayFinancialStatus }
      }
    }`,
    {variables: {input: {id: charge.shopifyOrderId}}},
  );

  const userErrors = markPaidResponse.data?.orderMarkAsPaid.userErrors ?? [];
  if (userErrors.length > 0) {
    return db.charge.update({
      where: {id: chargeId},
      data: {status: 'NEEDS_REVIEW', errorMessage: userErrors.map((e) => e.message).join('; ')},
    });
  }

  return db.charge.update({
    where: {id: chargeId},
    data: {status: 'PAID', paidAt: new Date(), reviewedAt: new Date(), reviewNote, errorMessage: null},
  });
}

export async function rejectCharge(chargeId: string, reason: string) {
  const charge = await db.charge.findUniqueOrThrow({where: {id: chargeId}});
  if (charge.status === 'PAID') {
    throw new Error('El cobro ya está pagado; no se puede rechazar un cobro pagado.');
  }
  if (charge.status === 'CANCELLED') return charge;

  const session = await getOfflineSession(charge.shop);
  const client = new shopify.clients.Graphql({session});

  const cancelResponse = await client.request<{
    orderCancel: {
      job: {id: string; done: boolean} | null;
      orderCancelUserErrors: {field: string[]; message: string; code: string}[];
      userErrors: {field: string[]; message: string}[];
    };
  }>(
    `#graphql
    mutation RejectCharge($orderId: ID!, $reason: OrderCancelReason!, $staffNote: String) {
      orderCancel(
        orderId: $orderId
        reason: $reason
        staffNote: $staffNote
        notifyCustomer: true
        restock: true
        refundMethod: { originalPaymentMethodsRefund: false }
      ) {
        job { id done }
        orderCancelUserErrors { field message code }
        userErrors { field message }
      }
    }`,
    {variables: {orderId: charge.shopifyOrderId, reason: 'DECLINED', staffNote: reason}},
  );

  const cancel = cancelResponse.data?.orderCancel;
  const errors = [...(cancel?.orderCancelUserErrors ?? []), ...(cancel?.userErrors ?? [])];
  if (errors.length > 0) {
    return db.charge.update({
      where: {id: chargeId},
      data: {status: 'NEEDS_REVIEW', errorMessage: errors.map((e) => e.message).join('; ')},
    });
  }

  return db.charge.update({
    where: {id: chargeId},
    data: {status: 'CANCELLED', reviewedAt: new Date(), reviewNote: reason},
  });
}
