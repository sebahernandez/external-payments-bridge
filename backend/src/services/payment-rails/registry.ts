import type {PaymentRail} from './types.js';
import {manualConfirmRail} from './manual-confirm.js';

const RAILS: Record<string, PaymentRail> = {
  [manualConfirmRail.id]: manualConfirmRail,
};

export function getPaymentRail(providerId: string): PaymentRail {
  const rail = RAILS[providerId];
  if (!rail) throw new Error(`Unknown payment rail: ${providerId}`);
  return rail;
}
