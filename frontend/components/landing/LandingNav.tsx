"use client";

import { useEffect, useState } from "react";
import { BrandMark } from "./ui";

export default function LandingNav() {
  const [stuck, setStuck] = useState(false);

  // 吸顶阴影
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 border-b border-transparent bg-[rgba(240,253,250,0.85)] backdrop-blur-md backdrop-saturate-[180%] transition-[border-color,box-shadow,background] duration-200 ${
        stuck
          ? "border-[#D8EDEC] shadow-[0_1px_12px_rgba(13,148,136,0.05)]"
          : ""
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1120px] items-center justify-between gap-4 px-5">
        <a
          className="flex cursor-pointer items-center gap-[10px] text-[19px] font-bold tracking-[-0.02em] text-[#0B2B2A]"
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          <BrandMark size={34} />
          识界
        </a>
      </div>
    </header>
  );
}
