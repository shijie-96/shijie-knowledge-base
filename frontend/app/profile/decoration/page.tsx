import type { Metadata } from "next";
import DecorationSettings from "@/components/decoration/DecorationSettings";

export const metadata: Metadata = {
  title: "名片与网页外观",
  description: "公开主页名片装扮与全站网页外观设置合并页，全部开放使用",
};

export default function ProfileDecorationPage() {
  return <DecorationSettings />;
}
