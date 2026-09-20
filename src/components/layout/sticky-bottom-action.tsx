import type { HTMLAttributes } from "react";

export function StickyBottomAction(props: HTMLAttributes<HTMLDivElement>) {
  const { className = "", ...rest } = props;

  return <div className={`sticky-action ${className}`} {...rest} />;
}
