import type { HTMLAttributes, ReactNode } from "react";

type SectionCardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  appearance?: "default" | "current";
  tone?: "surface" | "items" | "today" | "stock";
};

const appearanceClasses = {
  default: "p-6 shadow-card ring-border-soft",
  current: "p-5 shadow-soft ring-[#edf3ef]",
};

const toneClasses = {
  surface: "bg-surface",
  items: "bg-card-items",
  today: "bg-card-today",
  stock: "bg-card-stock",
};

export function SectionCard({
  children,
  className = "",
  appearance = "default",
  tone = "surface",
  ...props
}: SectionCardProps) {
  return (
    <section
      className={`rounded-card ring-1 ${toneClasses[tone]} ${appearanceClasses[appearance]} ${className}`}
      {...props}
    >
      {children}
    </section>
  );
}
