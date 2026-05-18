import { IconExternal } from "./icons";
import { tryAsNominee } from "./links";

export function TryButton({
  size = "default",
  variant = "secondary",
  children,
}: {
  size?: "default" | "large";
  variant?: "wax" | "secondary" | "ink";
  children?: React.ReactNode;
}) {
  const padX = size === "large" ? 26 : 22;
  const padY = size === "large" ? 14 : 12;
  const fontSize = size === "large" ? 15 : 14;
  const cls =
    variant === "wax" ? "btn btn-wax" : variant === "ink" ? "btn" : "btn btn-secondary";
  return (
    <a
      href={tryAsNominee()}
      target="_blank"
      rel="noopener noreferrer"
      className={cls}
      style={{ padding: `${padY}px ${padX}px`, fontSize }}
    >
      {children ?? "Try the Sagan archive"}
      <IconExternal size={size === "large" ? 15 : 13} />
    </a>
  );
}
