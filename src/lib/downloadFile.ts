/** Triggers a browser download of `contents` as a file named `filename` — the plain Blob-URL-and-click approach (the "download fallback" DESIGN.md §1/§16 calls out, used here as the primary mechanism rather than the less universally available File System Access API). */
export function downloadTextFile(filename: string, contents: string, mimeType: string): void {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
