import Image from "next/image";

/**
 * The pressed-wax seal. Pass `decorative` when the seal sits beside the
 * wordmark: the adjacent text already names the thing, so an alt of
 * "Heirloom seal" only adds a stray "seal" to the link's accessible
 * name and trips WCAG 2.5.3 (Label in Name).
 */
export function Seal({
  size = 36,
  decorative = false,
}: {
  size?: number;
  decorative?: boolean;
}) {
  return (
    <Image
      src="/seal-2x.png"
      alt={decorative ? "" : "Heirloom seal"}
      width={size}
      height={size}
      priority
      className="object-contain"
      style={{ width: size, height: size }}
    />
  );
}
