import Image from "next/image";
import Link from "next/link";

type Size = "header" | "small";

/** Seal + "Heirloom" wordmark used in every top-bar header. */
export function BrandMark({
  size = "header",
  href = "/",
  className = "",
}: {
  size?: Size;
  href?: string | null;
  className?: string;
}) {
  const dim = size === "header" ? 28 : 22;
  const text = size === "header" ? "text-[19px]" : "text-[17px]";
  const inner = (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <Image
        src="/seal.png"
        alt=""
        aria-hidden
        width={dim * 2}
        height={dim * 2}
        priority
        style={{ width: dim, height: dim }}
        className="object-contain"
      />
      <span className={`font-serif italic ${text} font-semibold text-ink tracking-[0.005em]`}>
        Heirloom
      </span>
    </span>
  );
  if (href == null) return inner;
  return (
    <Link href={href} className="inline-flex">
      {inner}
    </Link>
  );
}
