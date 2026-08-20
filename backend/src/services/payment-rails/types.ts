export type ChargeStatusValue =
  | 'PENDING'
  | 'PROCESSING'
  | 'PAID'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'NEEDS_REVIEW';

export interface CreateChargeInput {
  chargeId: string;
  shopifyOrderId: string;
  orderName: string;
  amount: string;
  currency: string;
}

export interface CreateChargeResult {
  externalReference: string;
  status: ChargeStatusValue;
  paymentInstructions?: Record<string, unknown>;
  raw: unknown;
}

export interface PaymentRail {
  readonly id: string;
  createCharge(input: CreateChargeInput): Promise<CreateChargeResult>;
}
