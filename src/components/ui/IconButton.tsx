import type { ButtonHTMLAttributes, ReactNode } from "react";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  label: string;
  tone?: "default" | "danger";
};

const toneClassNames = {
  default: "text-text-tertiary hover:bg-[#f7f7f7] focus-visible:bg-[#f7f7f7]",
  danger: "text-[#b45a53] hover:bg-[#fff0f4] focus-visible:bg-[#fff0f4]",
};

export function IconButton({
  children,
  className = "",
  label,
  tone = "default",
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-button transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 ${toneClassNames[tone]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
