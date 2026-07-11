type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  intro?: string;
  underline?: boolean;
  className?: string;
  as?: "h1" | "h2" | "h3";
};

export function SectionHeading({
  eyebrow,
  title,
  intro,
  underline = true,
  className = "",
  as: Tag = "h2",
}: SectionHeadingProps) {
  return (
    <div className={`max-w-3xl ${className}`}>
      {eyebrow ? <p className="eyebrow mb-3">{eyebrow}</p> : null}
      <Tag className={`text-3xl font-bold sm:text-4xl ${underline ? "heading-underline" : ""}`}>
        {title}
      </Tag>
      {intro ? <p className="mt-5 text-lg text-muted">{intro}</p> : null}
    </div>
  );
}
