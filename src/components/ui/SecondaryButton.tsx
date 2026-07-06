import type { ButtonHTMLAttributes, ReactNode } from "react";

type SecondaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

export function SecondaryButton({
  children,
  className = "",
  type = "button",
  ...props
}: SecondaryButtonProps) {
  return (
    <button
      type={type}
      className={`rounded-button border border-border-soft bg-surface px-5 font-semibold text-text-primary shadow-card transition active:scale-[0.99] ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
