import { Suspense } from "react";
import { Desktop } from "@/components/Desktop";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <Desktop id={id} />
    </Suspense>
  );
}
