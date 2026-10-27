import OrderShell from "@/components/order-shell";
import PickupTicket from "@/components/pickup-ticket";

export default async function PickupTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <OrderShell wide>
      <PickupTicket key={id} id={id} />
    </OrderShell>
  );
}
