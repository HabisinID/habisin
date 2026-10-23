import StoreProfile from "@/components/store-profile";

export default async function StoreProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StoreProfile key={id} id={id} />;
}
