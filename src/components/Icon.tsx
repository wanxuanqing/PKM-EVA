export function Icon({
  name,
  size = 20,
  ...props
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const paths: Record<string, string> = {
    search: 'm21 21-4.5-4.5 M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0',
    check: 'm5 12 4 4L19 6',
    arrow: 'M5 12h14m-5-5 5 5-5 5',
    chevron: 'm6 9 6 6 6-6',
    spark: 'm12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3',
    book: 'M4 3h12l4 4v14H4V3m12 0v5h4M8 12h8m-8 4h6',
    shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3',
    bolt: 'm13 2-9 12h7l-1 8 10-13h-7l0-7',
    save: 'M6 3h12v18l-6-4-6 4V3',
    close: 'm6 6 12 12M6 18 18 6',
    info: 'M12 11v6m0-10v.1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    trade: 'M3 7h17l-4-4m5 14H4l4 4M20 7l-4 4M4 17l4-4',
    circle: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name] ?? paths.circle} />
    </svg>
  );
}
export function BrandMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="13" fill="#183f35" />
      <path
        d="m11 21 6 6 13-15"
        fill="none"
        stroke="#d7e59d"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="28" cy="28" r="2" fill="#d7e59d" />
    </svg>
  );
}
