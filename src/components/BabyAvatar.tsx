type BabyAvatarProps = {
  size?: "sm" | "lg";
  className?: string;
};

const sizeClassNames = {
  sm: "h-12 w-12",
  lg: "h-20 w-20",
};

export function BabyAvatar({ size = "sm", className = "" }: BabyAvatarProps) {
  return (
    <div
      className={`grid shrink-0 place-items-center overflow-hidden rounded-avatar bg-[#fff0df] shadow-card ring-1 ring-[#f3dcc2] ${sizeClassNames[size]} ${className}`}
    >
      <img
        src="/images/baby-default.png"
        alt=""
        aria-hidden="true"
        className="h-full w-full object-cover"
      />
    </div>
  );
}
