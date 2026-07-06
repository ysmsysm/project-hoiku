import type { HTMLAttributes, ReactNode } from "react";

type SectionCardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  appearance?: "default" | "current";
};

const appearanceClasses = {
  default: "shadow-card ring-border-soft",
  current: "shadow-soft ring-[#edf3ef]",
};

export function SectionCard({
  children,
  className = "",
  appearance = "default",
  ...props
}: SectionCardProps) {
  return (
    <section
      className={`rounded-card bg-surface p-5 ring-1 ${appearanceClasses[appearance]} ${className}`}
      {...props}
    >
      {children}
    </section>
  );
}
