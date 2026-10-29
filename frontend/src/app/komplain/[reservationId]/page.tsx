import OrderShell from "@/components/order-shell";
import { ComplaintFormPage } from "@/components/feedback-form";

export default async function OrderComplaintPage({
  params,
}: {
  params: Promise<{ reservationId: string }>;
}) {
  const { reservationId } = await params;
  return (
    <OrderShell wide>
      <ComplaintFormPage key={reservationId} reservationId={reservationId} />
    </OrderShell>
  );
}
