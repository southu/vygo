/**
 * Deep-link affordance placed inside a heading that already carries a
 * stable id. Hidden until the heading is hovered or the link itself gets
 * keyboard focus, per the guide's hover-to-reveal anchor pattern.
 */
export function HeadingAnchor({ id }: { id: string }) {
  return (
    <a
      href={`#${id}`}
      className="ml-2 inline-block align-middle text-muted no-underline opacity-0 transition-opacity duration-150 hover:text-purple focus:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
      aria-label="Copy link to this section"
      data-heading-anchor
    >
      #
    </a>
  );
}
