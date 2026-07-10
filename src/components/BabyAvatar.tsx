import Image from "next/image";

type BabyAvatarProps = {
  size?: "sm" | "lg";
  imageUrl?: string | null;
  className?: string;
};

const sizeClassNames = {
  sm: "h-12 w-12",
  lg: "h-20 w-20",
};

export function BabyAvatar({
  size = "sm",
  imageUrl = null,
  className = "",
}: BabyAvatarProps) {
  const avatarSrc = imageUrl ?? "/images/baby-default.png";

  return (
    <div
      className={`grid shrink-0 place-items-center overflow-hidden rounded-avatar bg-[#fff0df] shadow-card ring-1 ring-[#f3dcc2] ${sizeClassNames[size]} ${className}`}
    >
      <Image
        src={avatarSrc}
        alt=""
        aria-hidden="true"
        width={80}
        height={80}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
