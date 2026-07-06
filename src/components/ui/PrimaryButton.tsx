import type { ButtonHTMLAttributes, ReactNode } from "react";

type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

export function PrimaryButton({
  children,
  className = "",
  type = "button",
  ...props
}: PrimaryButtonProps) {
  return (
    <button
      type={type}
      className={`rounded-button bg-primary px-6 font-semibold text-surface shadow-button transition hover:bg-primary-hover active:scale-[0.99] ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
