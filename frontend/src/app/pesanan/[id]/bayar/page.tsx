import OrderPayment from "@/components/order-payment";
import OrderShell from "@/components/order-shell";

export default async function OrderPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <OrderShell wide>
      <OrderPayment key={id} id={id} />
    </OrderShell>
  );
}
