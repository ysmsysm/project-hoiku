type AssigneeBadgeTone = "active" | "muted";

type AssigneeBadgeProps = {
  label: string;
  tone?: AssigneeBadgeTone;
};

const getAssigneeFontSize = (label: string) => {
  const length = Array.from(label).length;

  if (length <= 3) {
    return 13;
  }

  if (length <= 5) {
    return 12;
  }

  return 11;
};

export function AssigneeBadge({
  label,
  tone = "active",
}: AssigneeBadgeProps) {
  const toneClass =
    tone === "active"
      ? "bg-card-items text-icon-items"
      : "bg-[#eeeeee] text-text-secondary";

  return (
    <span
      className={`inline-flex h-6 min-w-fit shrink-0 items-center justify-center whitespace-nowrap rounded-button px-2 py-0.5 text-center font-normal leading-none ${toneClass}`}
      style={{ fontSize: `${getAssigneeFontSize(label)}px` }}
    >
      {label}
    </span>
  );
}
