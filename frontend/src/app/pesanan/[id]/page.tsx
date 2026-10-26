import OrderShell from "@/components/order-shell";
import OrderSummary from "@/components/order-summary";

export default async function OrderSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <OrderShell wide>
      <OrderSummary key={id} id={id} />
    </OrderShell>
  );
}
