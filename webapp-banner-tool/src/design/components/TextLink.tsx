import type { AnchorHTMLAttributes } from "react";

/** An inline link in running text: the link colour, marked as the `link` accent. */
export function TextLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a data-accent="link" {...props} />;
}
