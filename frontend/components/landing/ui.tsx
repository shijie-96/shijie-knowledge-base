"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/** 落地页品牌方块标志 */
export function BrandMark({ size = 34 }: { size?: number }) {
  const radius = size >= 30 ? 10 : 7;
  return (
    <span
      aria-hidden="true"
      className="inline-grid shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-[#14B8A6] to-[#0F766E] font-bold text-white shadow-[0_4px_12px_rgba(13,148,136,0.28)]"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        fontSize: size / 2,
      }}
    >
      识
    </span>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-[12px] whitespace-nowrap font-semibold transition-[background,box-shadow,transform] duration-200 ease-[cubic-bezier(.16,1,.3,1)] select-none";

/** 橙色主 CTA（大按钮） */
export function CtaButton({ className = "", children, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={`${base} bg-[#F97316] px-[26px] py-[14px] text-[15px] text-white shadow-[0_8px_24px_rgba(249,115,22,0.28)] hover:bg-[#EA580C] hover:shadow-[0_10px_28px_rgba(249,115,22,0.34)] active:translate-y-px ${className}`}
    >
      {children}
    </button>
  );
}

/** 描边幽灵按钮（大按钮） */
export function GhostButton({ className = "", children, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={`${base} border-[1.5px] border-[#D8EDEC] bg-transparent px-[26px] py-[14px] text-[15px] text-[#115E59] hover:border-[#5EEAD4] hover:bg-white active:translate-y-px ${className}`}
    >
      {children}
    </button>
  );
}

/** 小号幽灵按钮（导航用） */
export function GhostSmallButton({
  className = "",
  children,
  ...rest
}: BtnProps) {
  return (
    <button
      {...rest}
      className={`${base} border-[1.5px] border-[#D8EDEC] bg-transparent px-[18px] py-[8px] text-[14px] text-[#115E59] hover:border-[#5EEAD4] hover:bg-white ${className}`}
    >
      {children}
    </button>
  );
}

/** 导航主按钮（橙） */
export function NavCtaButton({ className = "", children, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={`${base} bg-[#F97316] px-[18px] py-[9px] text-[14px] text-white shadow-[0_4px_14px_rgba(249,115,22,0.24)] hover:bg-[#EA580C] ${className}`}
    >
      {children}
    </button>
  );
}

/** 区块头：tag + 标题 + 描述 */
export function SectionHead({
  tag,
  title,
  desc,
  center = false,
}: {
  tag: string;
  title: string;
  desc: string;
  center?: boolean;
}) {
  return (
    <div
      className={`mb-[48px] max-w-[44em] ${
        center ? "mx-auto text-center" : ""
      }`}
    >
      <p className="mb-[12px] text-[13px] font-bold uppercase tracking-[0.12em] text-[#0D9488]">
        {tag}
      </p>
      <h2 className="text-[clamp(26px,5vw,38px)] font-bold tracking-[-0.03em] text-[#0B2B2A]">
        {title}
      </h2>
      <p className="mt-[16px] text-[16.5px] text-[#4A7A75]">{desc}</p>
    </div>
  );
}
