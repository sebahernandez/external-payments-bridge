import {useLocation} from 'preact-iso';

export default function NotFoundPage() {
  const {route} = useLocation();

  return (
    <s-page heading="Página no encontrada">
      <s-section>
        <s-grid gap="base" justifyItems="center" paddingBlock="large-400">
          <s-paragraph>
            La página que buscás no existe.
          </s-paragraph>
          <s-button onClick={() => route('/')}>Volver al inicio</s-button>
        </s-grid>
      </s-section>
    </s-page>
  );
}
