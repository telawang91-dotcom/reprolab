type TitledDocument = { title: string | null; filename: string };

function filenameLabel(filename: string): string {
  const basename = filename.replace(/\\/g, "/").split("/").pop() || filename;
  return basename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function displayDocumentTitle(document: TitledDocument): string {
  const title = (document.title || "").trim();
  const suspicious = !title
    || title === document.filename
    || title.length < 4
    || /^\d+$/.test(title)
    || /^(from|import|def|class)\s+/i.test(title)
    || /(?:\.spe:|\bacq:)/i.test(title)
    || title.startsWith("{");
  return suspicious ? filenameLabel(document.filename) || document.filename : title;
}
