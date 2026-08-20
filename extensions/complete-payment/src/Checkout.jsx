import '@shopify/ui-extensions/preact';
import {render} from 'preact';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const orderConfirmation = shopify.orderConfirmation.value;
  const backendUrl = shopify.settings.value?.backend_url;

  if (!orderConfirmation?.order?.id || !backendUrl) {
    return null;
  }

  const paymentUrl = `${backendUrl.replace(/\/$/, '')}/pay?order=${encodeURIComponent(
    orderConfirmation.order.id,
  )}`;

  return (
    <s-banner heading={shopify.i18n.translate('heading')}>
      <s-stack gap="base">
        <s-text>{shopify.i18n.translate('body')}</s-text>
        <s-link href={paymentUrl} target="_blank">
          {shopify.i18n.translate('cta')}
        </s-link>
      </s-stack>
    </s-banner>
  );
}
