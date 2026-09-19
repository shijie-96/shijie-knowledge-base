"use client";

import { useEffect, useState } from "react";
import { BrandMark } from "./ui";

const SECTIONS = [
  { id: "#top", label: "识界" },
  { id: "#loop", label: "闭环" },
  { id: "#why", label: "为什么不同" },
  { id: "#scenes", label: "怎么用" },
  { id: "#start", label: "成长" },
];

export default function SideNav() {
  const [active, setActive] = useState(SECTIONS[0].id);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY + window.innerHeight / 3;
      let current = SECTIONS[0].id;
      for (const section of SECTIONS) {
        const el = document.querySelector(section.id);
        if (el && (el as HTMLElement).offsetTop <= scrollY) {
          current = section.id;
        }
      }
      setActive(current);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    const el = document.querySelector(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <nav
      aria-label="页面分段导航"
      className="fixed right-3 top-1/2 z-50 flex -translate-y-1/2 flex-col items-end gap-3 md:right-6 md:gap-5"
    >
      {SECTIONS.map((s, i) => {
        const isActive = active === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => scrollTo(s.id)}
            className="group flex items-center justify-end gap-2 rounded-full p-2 md:gap-3 md:p-0"
            aria-label={s.label}
          >
            <span
              className={`hidden items-center gap-[7px] whitespace-nowrap text-[12px] font-medium transition-colors duration-200 md:flex ${
                isActive ? "text-[#0D9488]" : "text-[#6E9A95]"
              }`}
            >
              {i === 0 && <BrandMark size={22} />}
              {s.label}
            </span>
            {/* 手机端：圆点，更明显 */}
            <span
              className={`block rounded-full transition-all duration-300 md:hidden ${
                isActive
                  ? "h-2.5 w-2.5 bg-[#0D9488] shadow-[0_0_0_3px_rgba(13,148,136,0.15)]"
                  : "h-2.5 w-2.5 bg-[#D8EDEC] ring-1 ring-[#BFE3DE] group-hover:bg-[#99F6E4]"
              }`}
            />
            {/* 桌面端：横线 + 文案 */}
            <span
              className={`hidden h-[2px] rounded-full transition-all duration-300 md:block ${
                isActive
                  ? "w-8 bg-[#0D9488]"
                  : "w-4 bg-[#D8EDEC] group-hover:w-6 group-hover:bg-[#99F6E4]"
              }`}
            />
          </button>
        );
      })}
    </nav>
  );
}
