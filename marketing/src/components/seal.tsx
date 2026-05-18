import Image from "next/image";

export function Seal({ size = 36 }: { size?: number }) {
  return (
    <Image
      src="/seal-2x.png"
      alt="Heirloom seal"
      width={size}
      height={size}
      priority
      className="object-contain"
      style={{ width: size, height: size }}
    />
  );
}
