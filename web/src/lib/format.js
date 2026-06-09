// Editorial currency — matches the design hand-off ("€ 4.890").
export function money(value) {
  return "€ " + Number(value || 0).toLocaleString("nl-NL");
}

// Resolve an uploaded file to its served URL. Accepts either a server-side
// absolute path (image_path) or an already-built /uploads URL (image_url).
export function fileUrl(path) {
  if (!path) return "";
  if (path.startsWith("/uploads/")) return path;
  return `/uploads/${path.split("/").pop()}`;
}
