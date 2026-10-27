import OrderList from "@/components/order-list";
import OrderShell from "@/components/order-shell";

export default function OrdersPage() {
  return (
    <OrderShell wide>
      <OrderList />
    </OrderShell>
  );
}
