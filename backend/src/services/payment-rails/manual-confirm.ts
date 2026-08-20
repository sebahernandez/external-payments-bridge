import type {PaymentRail} from './types.js';

// No real processor: generates a reference and waits for a human (merchant
// support, or the buyer themselves on the /pay page) to confirm the payment
// happened. Exists so the full webhook -> charge -> confirm -> orderMarkAsPaid
// loop can be exercised end to end before any real rail is wired up.
export const manualConfirmRail: PaymentRail = {
  id: 'manual-confirm',

  async createCharge(input) {
    return {
      externalReference: `MANUAL-${input.chargeId}`,
      status: 'PENDING',
      paymentInstructions: {
        note: 'Confirmá este pago manualmente desde la página de pago una vez que recibas el dinero.',
      },
      raw: null,
    };
  },
};
