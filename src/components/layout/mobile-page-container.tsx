import type { HTMLAttributes } from "react";

export function MobilePageContainer({
  className = "",
  ...props
}: HTMLAttributes<HTMLElement>) {
  return <main className={`mobile-page ${className}`} {...props} />;
}
