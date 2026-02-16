import { PDFDocument } from "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";
import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

const els = {
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("fileInput"),
  cleanBtn: document.getElementById("cleanBtn"),
  clearBtn: document.getElementById("clearBtn"),
  boxWidth: document.getElementById("boxWidth"),
  boxHeight: document.getElementById("boxHeight"),
  removeEdgeText: document.getElementById("removeEdgeText"),
  removeAnnots: document.getElementById("removeAnnots"),
  fileLabel: document.getElementById("fileLabel"),
  log: document.getElementById("log"),
};

/** @type {File | null} */
let selectedFile = null;
let isBusy = false;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const n = i === 0 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${n} ${units[i]}`;
}

function nowTime() {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function logLine(message) {
  const line = `[${nowTime()}] ${message}\n`;
  els.log.textContent += line;
  els.log.scrollTop = els.log.scrollHeight;
}

function setFile(file) {
  selectedFile = file;
  els.fileLabel.textContent = file ? file.name : "No file selected";
  els.cleanBtn.disabled = !file || isBusy;
  els.clearBtn.disabled = !file || isBusy;

  const info = document.getElementById("dropFileInfo");
  const name = document.getElementById("dropFileName");
  const meta = document.getElementById("dropFileMeta");
  if (info && name && meta) {
    if (file) {
      info.hidden = false;
      name.textContent = file.name;
      meta.textContent = `${formatBytes(file.size)} • ${file.type || "application/pdf"}`;
    } else {
      info.hidden = true;
      name.textContent = "";
      meta.textContent = "";
    }
  }
}

function setBusy(busy) {
  isBusy = busy;
  els.cleanBtn.disabled = !selectedFile || busy;
  els.clearBtn.disabled = !selectedFile || busy;
  els.fileInput.disabled = busy;
  els.dropzone.setAttribute("aria-disabled", busy ? "true" : "false");
}

function getOptions() {
  const boxWidth = Math.max(0, Number.parseInt(els.boxWidth.value || "0", 10));
  const boxHeight = Math.max(0, Number.parseInt(els.boxHeight.value || "0", 10));
  const removeEdgeText = Boolean(els.removeEdgeText.checked);
  const removeAnnots = Boolean(els.removeAnnots && els.removeAnnots.checked);
  return { boxWidth, boxHeight, removeEdgeText, removeAnnots };
}

function suggestOutputName(inputName) {
  const lower = inputName.toLowerCase();
  if (lower.endsWith(".pdf")) return `${inputName.slice(0, -4)}_clean.pdf`;
  return `${inputName}_clean.pdf`;
}

function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function rectDistance(a, b) {
  const dx = Math.max(0, Math.max(a.x0 - b.x1, b.x0 - a.x1));
  const dy = Math.max(0, Math.max(a.y0 - b.y1, b.y0 - a.y1));
  return Math.sqrt(dx * dx + dy * dy);
}

function clampRectToPage(r, pageWidth, pageHeight) {
  return {
    x0: Math.max(0, r.x0),
    y0: Math.max(0, r.y0),
    x1: Math.min(pageWidth, r.x1),
    y1: Math.min(pageHeight, r.y1),
  };
}

function rectsIntersect(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

function pdfObjToNumber(obj) {
  if (!obj) return null;
  if (typeof obj.asNumber === "function") return obj.asNumber();
  if (typeof obj.numberValue === "function") return obj.numberValue();
  if (typeof obj.numberValue === "number") return obj.numberValue;
  if (typeof obj.value === "number") return obj.value;
  return null;
}

function safeLookup(context, obj) {
  if (!obj) return null;
  try {
    return context.lookup(obj);
  } catch {
    return null;
  }
}

function getPdfArraySize(arr) {
  if (!arr) return 0;
  if (typeof arr.size === "function") return arr.size();
  if (typeof arr.size === "number") return arr.size;
  if (typeof arr.length === "number") return arr.length;
  return 0;
}

function removeAnnotationsInRects(pdfDoc, page, rects) {
  if (!rects || rects.length === 0) return 0;
  const context = pdfDoc.context;

  const annotsObj = page.node.get(PDFName.of("Annots"));
  const annots = safeLookup(context, annotsObj);
  if (!(annots instanceof PDFArray)) return 0;

  const kept = [];
  let removed = 0;
  const n = getPdfArraySize(annots);

  for (let i = 0; i < n; i++) {
    const ref = annots.get(i);
    const annot = safeLookup(context, ref);
    if (!annot || typeof annot.get !== "function") {
      kept.push(ref);
      continue;
    }

    const rectObj = annot.get(PDFName.of("Rect"));
    const rectArr = safeLookup(context, rectObj);
    if (!(rectArr instanceof PDFArray) || getPdfArraySize(rectArr) < 4) {
      kept.push(ref);
      continue;
    }

    const x0 = pdfObjToNumber(safeLookup(context, rectArr.get(0)));
    const y0 = pdfObjToNumber(safeLookup(context, rectArr.get(1)));
    const x1 = pdfObjToNumber(safeLookup(context, rectArr.get(2)));
    const y1 = pdfObjToNumber(safeLookup(context, rectArr.get(3)));
    if (![x0, y0, x1, y1].every((v) => Number.isFinite(v))) {
      kept.push(ref);
      continue;
    }

    const r = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
    const intersects = rects.some((cleanRect) => rectsIntersect(r, cleanRect));

    if (intersects) removed++;
    else kept.push(ref);
  }

  page.node.set(PDFName.of("Annots"), context.obj(kept));
  return removed;
}

function itemToRectInViewport(item, viewport) {
  const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
  const x = tx[4];
  const y = tx[5];
  const fontHeight = Math.hypot(tx[2], tx[3]) || 0;
  const scaleX = Math.hypot(tx[0], tx[1]) || 1;
  const width = Math.max(0, (item.width || 0) * scaleX);
  const height = Math.max(0, fontHeight);

  // viewport coords: origin top-left, y down
  const x0 = x;
  const y0 = y - height;
  const x1 = x0 + width;
  const y1 = y0 + height;

  return { x0, y0, x1, y1 };
}

async function findEdgeTextRects(pdfjsPage, viewport, pageWidth, pageHeight) {
  // Simple, robust watermark detection:
  // Body content = text starting from LEFT side of page (x < 50%)
  // Watermark = small text in right half, BELOW all left-side content
  const MAX_CHARS = 40;

  const scale = viewport.scale || 1;
  const PADDING = 2.0 * scale;

  const textContent = await pdfjsPage.getTextContent();
  const items = (textContent.items || [])
    .filter((it) => typeof it.str === "string" && it.str.trim().length > 0)
    .map((it) => {
      const rect = itemToRectInViewport(it, viewport);
      const text = it.str.trim();
      return { rect, text };
    })
    .filter(({ rect }) => Number.isFinite(rect.x0) && Number.isFinite(rect.y0) && rect.x1 > rect.x0);

  // Find the bottom of the last LEFT-SIDE text (real body content).
  // Body content always starts from the left half of the page.
  // Watermarks are always on the right side.
  const halfX = pageWidth * 0.50;
  let lastLeftTextY = 0;
  for (const { rect } of items) {
    if (rect.x0 < halfX) {
      lastLeftTextY = Math.max(lastLeftTextY, rect.y1);
    }
  }

  /** @type {{x0:number,y0:number,x1:number,y1:number}[]} */
  const redact = [];

  for (const { rect, text } of items) {
    const compactLen = text.replace(/\s+/g, "").length;
    if (compactLen === 0 || compactLen > MAX_CHARS) continue;

    // Must be in right half of page
    if (rect.x0 < halfX) continue;

    // Must be BELOW all left-side content (watermark is at the end)
    if (rect.y0 < lastLeftTextY) continue;

    const padded = clampRectToPage(
      { x0: rect.x0 - PADDING, y0: rect.y0 - PADDING, x1: rect.x1 + PADDING, y1: rect.y1 + PADDING },
      pageWidth,
      pageHeight,
    );
    redact.push(padded);
  }

  return redact;
}

async function cleanPdf(file, options) {
  const inputBuffer = await file.arrayBuffer();
  const inputBytes = new Uint8Array(inputBuffer);

  logLine("Loading PDF…");

  // Use pdf.js to render pages — this is the only way to truly remove
  // content like PyMuPDF's redaction.  We render each page to a canvas,
  // white-out the watermark area at the pixel level, then rebuild a new
  // PDF from the rendered images.
  const RENDER_SCALE = 3; // high-quality rendering (216 DPI)

  const pdfjsDoc = await pdfjsLib.getDocument({ data: inputBytes }).promise;
  const numPages = pdfjsDoc.numPages;
  logLine(`Pages: ${numPages}`);

  // Create a brand-new output PDF
  const outDoc = await PDFDocument.create();

  for (let i = 1; i <= numPages; i++) {
    const pdfjsPage = await pdfjsDoc.getPage(i);

    // Get the original page size (in PDF points)
    const origVp = pdfjsPage.getViewport({ scale: 1 });
    const pageW = origVp.width;   // points
    const pageH = origVp.height;  // points

    // Render at higher resolution for quality
    const viewport = pdfjsPage.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement("canvas");
    canvas.width  = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");

    // White background (some PDFs have transparent backgrounds)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Render the full page onto the canvas
    await pdfjsPage.render({ canvasContext: ctx, viewport }).promise;

    // ---- Clean bottom-right area (canvas coords: origin top-left, same as PyMuPDF) ----
    if (options.boxWidth > 0 && options.boxHeight > 0) {
      const bw = options.boxWidth  * RENDER_SCALE;
      const bh = options.boxHeight * RENDER_SCALE;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(canvas.width - bw, canvas.height - bh, bw, bh);
      logLine(`Page ${i}: Cleaned bottom-right ${options.boxWidth}×${options.boxHeight} pt`);
    }

    // ---- Clean small right-edge text (same heuristic as before) ----
    if (options.removeEdgeText) {
      try {
        const rects = await findEdgeTextRects(
          pdfjsPage, viewport, canvas.width, canvas.height,
        );
        if (rects.length > 0) {
          ctx.fillStyle = "#ffffff";
          for (const r of rects) {
            ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
          }
          logLine(`Page ${i}: Removed ${rects.length} edge-text fragment(s)`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logLine(`Edge-text cleanup skipped on page ${i} (${msg}).`);
      }
    }

    // ---- Convert canvas → JPEG bytes → embed in new PDF ----
    const jpegBlob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92),
    );
    const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
    const img = await outDoc.embedJpg(jpegBytes);

    // Add a page with the original PDF dimensions and draw the image
    const page = outDoc.addPage([pageW, pageH]);
    page.drawImage(img, {
      x: 0,
      y: 0,
      width:  pageW,
      height: pageH,
    });

    logLine(`Processed page ${i}/${numPages}`);
  }

  const outBytes = await outDoc.save({ useObjectStreams: true });
  return outBytes;
}

function resetUI() {
  els.log.textContent = "";
  setFile(null);
  els.fileInput.value = "";
}

async function run() {
  if (!selectedFile) return;
  const nameLower = (selectedFile.name || "").toLowerCase();
  if (selectedFile.type && selectedFile.type !== "application/pdf" && !nameLower.endsWith(".pdf")) {
    logLine("This doesn't look like a PDF. Please select a .pdf file.");
    return;
  }

  const options = getOptions();
  if (options.boxWidth === 0 && options.boxHeight === 0 && !options.removeEdgeText) {
    logLine("Nothing to do (all cleaning options are disabled).");
    return;
  }

  setBusy(true);
  try {
    logLine(`Input: ${selectedFile.name}`);
    logLine(
      `Options: bottom-right box ${options.boxWidth}x${options.boxHeight} pt; edge-text=${options.removeEdgeText}; annots=${options.removeAnnots}`,
    );

    const out = await cleanPdf(selectedFile, options);
    const outputName = suggestOutputName(selectedFile.name);

    logLine(`Saving: ${outputName}`);
    downloadBytes(out, outputName);
    logLine("Done.");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logLine(`ERROR: ${msg}`);
    if (/encrypt|password/i.test(msg)) {
      logLine("This PDF looks password-protected/encrypted. The web version can't process encrypted PDFs.");
    } else {
      logLine("If this PDF is password-protected/encrypted, the web version can't process it.");
    }
  } finally {
    setBusy(false);
  }
}

els.cleanBtn.addEventListener("click", run);
els.clearBtn.addEventListener("click", resetUI);

els.fileInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  els.log.textContent = "";
  setFile(file);
  logLine("File selected. Click “Clean & Download”.");
});

function acceptFileFromDrop(file) {
  if (!file) return;
  els.log.textContent = "";
  setFile(file);
  logLine("File dropped. Click “Clean & Download”.");
}

els.dropzone.addEventListener("click", (e) => {
  if (isBusy) return;
  // Don't trigger if clicking the label itself (it has its own 'for' attribute)
  if (e.target.tagName === 'LABEL' || e.target.closest('label')) return;
  els.fileInput.click();
});

els.dropzone.addEventListener("keydown", (e) => {
  if (isBusy) return;
  // Don't trigger if focused on the label itself
  if (e.target.tagName === 'LABEL' || e.target.closest('label')) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    els.fileInput.click();
  }
});

els.dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (isBusy) return;
  els.dropzone.classList.add("dragover");
});

els.dropzone.addEventListener("dragleave", () => {
  els.dropzone.classList.remove("dragover");
});

els.dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  els.dropzone.classList.remove("dragover");
  if (isBusy) return;
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  acceptFileFromDrop(file);
});

logLine("Ready. Select a PDF to begin.");
