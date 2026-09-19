import type { ParaCategory } from "@/types";

/** PARA+S 目录定义（含图标与主题色） */
export const PARA_META: {
  value: ParaCategory;
  label: string;
  name: string;
  desc: string;
  color: string; // 用于选中态主题色
  dot: string; // 目录指示点颜色
}[] = [
  {
    value: "projects",
    label: "项目",
    name: "Projects",
    desc: "正在做的事，知道要做成啥，还有必须做完的日子",
    color: "text-accent-400 border-accent-500 bg-accent-500/10",
    dot: "bg-accent-400",
  },
  {
    value: "areas",
    label: "领域",
    name: "Areas",
    desc: "要一直管好的事情，没有做完的一天，得经常照看",
    color: "text-sky-400 border-sky-500 bg-sky-500/10",
    dot: "bg-sky-400",
  },
  {
    value: "resources",
    label: "资源",
    name: "Resources",
    desc: "你喜欢、想多了解的东西",
    color: "text-violet-400 border-violet-500 bg-violet-500/10",
    dot: "bg-violet-400",
  },
  {
    value: "archives",
    label: "归档",
    name: "Archives",
    desc: "已经不用了、放起来存好，平时很少翻看的旧东西",
    color: "text-mist-400 border-mist-600 bg-mist-600/10",
    dot: "bg-mist-400",
  },
  {
    value: "skills",
    label: "技能",
    name: "Skills",
    desc: "学会的本事，可以用到好多不同事情上",
    color: "text-emerald-400 border-emerald-500 bg-emerald-500/10",
    dot: "bg-emerald-400",
  },
];

/** PARA 中文标签映射 */
export const PARA_LABEL: Record<ParaCategory, string> = {
  projects: "项目",
  areas: "领域",
  resources: "资源",
  archives: "归档",
  skills: "技能",
};
