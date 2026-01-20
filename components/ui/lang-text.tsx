type Props = {
  en: string;
  fr: string;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
};

export function LangText({ en, fr, as = "span", className }: Props) {
  const Tag = as;
  return (
    <Tag className={className}>
      <span data-lang="en">{en}</span>
      <span data-lang="fr">{fr}</span>
    </Tag>
  );
}
