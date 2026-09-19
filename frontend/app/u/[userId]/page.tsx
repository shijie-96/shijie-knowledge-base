import PublicProfileView from "@/components/profile/PublicProfileView";

interface Props {
  params: { userId: string };
}

/**
 * 公开主页（访客视角，未登录可访问）
 * 路由：/u/{userId}
 */
export default function PublicProfilePage({ params }: Props) {
  return <PublicProfileView userId={params.userId} />;
}
