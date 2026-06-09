// Minimal line-icon set ported verbatim from the Nova Studio design hand-off.
const ICONS = {
  projects: "M3 6.5h6l1.5 2H21v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6.5Z",
  clients: "M12 12.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM5 19a7 7 0 0 1 14 0",
  library: "M5 4h4v16H5zM10.5 4h4v16h-4zM16.5 5.2l3.2.9-3.4 14-3.1-.9z",
  intake: "M6 3h9l4 4v14H6zM14 3v5h5",
  overview: "M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 13h7v7H4z",
  mood: "M4 5h16v11H4zM4 16l4.5-4.5 3 3L16 9l4 4M9 9.5a1.2 1.2 0 1 0 0-.01",
  palette: "M12 3a9 9 0 1 0 0 18c1.2 0 1.8-1 1.4-2-.4-1 .2-2 1.3-2H17a4 4 0 0 0 0-8c-1.6-2.4-3-4-5-4Z M7.5 11.5h.01M10 8h.01M14.5 8h.01",
  plan: "M4 4h16v16H4zM9 4v16M4 12h5M14 4v6M14 10h6",
  cart: "M4 5h2l1.4 9.5a1 1 0 0 0 1 .9h7.8a1 1 0 0 0 1-.8L19 8H7M9 20a1 1 0 1 0 0-.01M17 20a1 1 0 1 0 0-.01",
  proposal: "M7 3h7l4 4v14H7zM14 3v5h5M10 13h6M10 16.5h4",
  budget: "M12 3v18M16 7H10a2.5 2.5 0 0 0 0 5h4a2.5 2.5 0 0 1 0 5H8",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6 6 18",
  arrowR: "M5 12h14M13 6l6 6-6 6",
  arrowL: "M19 12H5M11 6l-6 6 6 6",
  chevR: "M9 6l6 6-6 6",
  chevD: "M6 9l6 6 6-6",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  rows: "M4 6h16M4 12h16M4 18h16",
  editorial: "M4 4h16v7H4zM4 14h7v6H4zM13 14h7v6h-7z",
  present: "M3 4h18v12H3zM12 16v4M8 20h8M9.5 8l4 2-4 2z",
  check: "M5 12.5l4.5 4.5L19 7",
  dot: "M12 12a1 1 0 1 0 0-.01",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM4 12l-1 .3.7 2.4 1.2-.2M19 12l1 .3-.7 2.4-1.2-.2M12 4l.3-1 2.4.7-.2 1.2M12 20l.3 1 2.4-.7-.2-1.2",
  expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  edit: "M5 19h3l9-9-3-3-9 9zM14 6l3 3M14 19h6",
  trash: "M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13",
  image: "M4 5h16v14H4zM4 16l4.5-4.5 3 3L16 9l4 4M9 9.5a1.2 1.2 0 1 0 0-.01",
  supplier: "M3 7h11v8H3zM14 10h4l3 3v2h-7M7 18a1.6 1.6 0 1 0 0-.01M18 18a1.6 1.6 0 1 0 0-.01",
  spark: "M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z",
  graph: "M6 18a2 2 0 1 0 0-.01M18 8a2 2 0 1 0 0-.01M18 18a2 2 0 1 0 0-.01M7.5 16.5l9-7M8 18h8",
  calendar: "M4 5h16v15H4zM4 9h16M8 3v4M16 3v4M8 13h3v3H8z",
  doc: "M7 3h7l4 4v14H7zM14 3v5h5M9 13h6M9 16.5h4",
  link: "M9 15l6-6M10 7l1-1a3.5 3.5 0 0 1 5 5l-1 1M14 17l-1 1a3.5 3.5 0 0 1-5-5l1-1",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  lock: "M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3M12 15v2",
  user: "M12 12.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM5 19a7 7 0 0 1 14 0",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5",
  ruler: "M4 14l10-10 6 6L10 20zM8 8l2 2M11 5l2 2M5 11l2 2",
  star: "M12 3l2.7 6.3 6.8.6-5.1 4.5 1.5 6.6L12 17.8 6.1 21l1.5-6.6L2.5 9.9l6.8-.6z",
  download: "M12 4v11M7 11l5 5 5-5M5 20h14",
  upload: "M12 20V9M7 13l5-5 5 5M5 4h14",
  filter: "M4 5h16l-6 7v6l-4 2v-8z",
  history: "M4 12a8 8 0 1 0 8-8 8 8 0 0 0-7 4M5 4v4h4M12 8v4l3 2"
};

export function Icon({ name, size = 18, stroke = 1.6, style }) {
  const d = ICONS[name];
  if (!d) return null;
  return (
    <span className="ic" style={style}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </span>
  );
}
