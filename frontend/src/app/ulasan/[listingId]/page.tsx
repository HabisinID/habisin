import OrderShell from "@/components/order-shell";
import { ReviewFormPage } from "@/components/feedback-form";

export default async function ProductReviewPage({
  params,
}: {
  params: Promise<{ listingId: string }>;
}) {
  const { listingId } = await params;
  return (
    <OrderShell wide>
      <ReviewFormPage key={listingId} listingId={listingId} />
    </OrderShell>
  );
}
