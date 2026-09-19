import ImmersiveReader from "@/components/reader/ImmersiveReader";

/** 沉浸式阅读器页面：超长素材完整保留，边读边划线写元认知 */
export default function ReadPage({
  params,
}: {
  params: { id: string };
}) {
  return <ImmersiveReader materialId={params.id} />;
}
