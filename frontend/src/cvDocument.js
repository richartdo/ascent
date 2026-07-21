export const CV_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
export const CV_TEXT_MAX_LENGTH = 20_000;
export const CV_DOCUMENT_EXTENSIONS = Object.freeze(['pdf', 'docx', 'txt']);

const extensionOf = filename => filename.split('.').pop()?.toLowerCase() || '';

export function isSupportedCvDocument(filename) {
  return CV_DOCUMENT_EXTENSIONS.includes(extensionOf(filename));
}

export async function extractCvDocumentText(file, filename = file.name || '') {
  if (!isSupportedCvDocument(filename)) {
    throw new Error('Use a PDF, DOCX, or TXT file. Legacy DOC files must first be saved as DOCX or PDF.');
  }
  if (file.size > CV_DOCUMENT_MAX_BYTES) {
    throw new Error('The CV file must be no larger than 5 MB.');
  }

  const extension = extensionOf(filename);
  let text;

  if (extension === 'txt') {
    text = await file.text();
  } else if (extension === 'docx') {
    const { default: mammoth } = await import('mammoth/mammoth.browser.js');
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    text = result.value;
  } else {
    text = await extractPdfText(await file.arrayBuffer());
  }

  const normalized = text
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!normalized) {
    throw new Error('No readable text was found. Scanned PDFs need OCR and should be pasted as text for now.');
  }
  if (normalized.length > CV_TEXT_MAX_LENGTH) {
    throw new Error(`The extracted CV is ${normalized.length.toLocaleString()} characters. Reduce it to ${CV_TEXT_MAX_LENGTH.toLocaleString()} characters before analysis.`);
  }

  return normalized;
}

async function extractPdfText(arrayBuffer) {
  const [{ GlobalWorkerOptions, getDocument }, { default: pdfWorkerUrl }] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
  ]);
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const loadingTask = getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;
  const pages = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => ('str' in item ? item.str : '')).join(' '));
      page.cleanup?.();
    }
  } finally {
    await loadingTask.destroy();
  }

  return pages.join('\n\n');
}
