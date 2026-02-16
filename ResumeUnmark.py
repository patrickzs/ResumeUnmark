import fitz  # PyMuPDF
import os
import sys


# --- Optional configuration (tune if needed) ---
# Bottom-right area to always remove on every page.
REMOVE_WIDTH = 200
REMOVE_HEIGHT = 70

# Extra: remove small, isolated text near the right edge (common for "© site.com" watermarks).
EDGE_WATERMARK_MIN_RIGHT_RATIO = 0.70  # candidate starts in right-most 30% of the page
EDGE_WATERMARK_MIN_DOWN_RATIO = 0.35   # ignore top header area
EDGE_WATERMARK_MAX_CHARS = 40          # only small text blocks/lines
EDGE_WATERMARK_MIN_DISTANCE = 25.0     # must be isolated from main content (points)
EDGE_WATERMARK_PADDING = 2.0           # padding around redaction rects (points)


def _clamp_rect_to_page(rect: fitz.Rect, page_rect: fitz.Rect) -> fitz.Rect:
    return fitz.Rect(
        max(page_rect.x0, rect.x0),
        max(page_rect.y0, rect.y0),
        min(page_rect.x1, rect.x1),
        min(page_rect.y1, rect.y1),
    )


def _rect_distance(a: fitz.Rect, b: fitz.Rect) -> float:
    dx = max(0.0, max(a.x0 - b.x1, b.x0 - a.x1))
    dy = max(0.0, max(a.y0 - b.y1, b.y0 - a.y1))
    return (dx * dx + dy * dy) ** 0.5


def _find_edge_text_watermark_rects(
    page: fitz.Page,
    *,
    min_right_ratio: float = EDGE_WATERMARK_MIN_RIGHT_RATIO,
    min_down_ratio: float = EDGE_WATERMARK_MIN_DOWN_RATIO,
    max_chars: int = EDGE_WATERMARK_MAX_CHARS,
    min_distance: float = EDGE_WATERMARK_MIN_DISTANCE,
    padding: float = EDGE_WATERMARK_PADDING,
) -> list[fitz.Rect]:
    """
    Finds small "edge/footer" text blocks in the right-side whitespace and returns
    their bounding boxes for redaction, regardless of text content.

    Heuristic: redact small text blocks that are (a) on the right side, (b) below the
    header area, and (c) sufficiently far from the main content blocks.
    """
    page_rect = page.rect
    min_x = page_rect.width * min_right_ratio
    min_y = page_rect.height * min_down_ratio

    blocks = page.get_text("blocks") or []
    text_blocks: list[tuple[fitz.Rect, str]] = []
    for b in blocks:
        if len(b) < 7:
            continue
        x0, y0, x1, y1, text, _block_no, block_type = b[:7]
        if block_type != 0:
            continue
        block_rect = fitz.Rect(x0, y0, x1, y1)
        text_blocks.append((block_rect, (text or "").strip()))

    body_rects: list[fitz.Rect] = [r for r, t in text_blocks if len(t) >= 60]

    redaction_rects: list[fitz.Rect] = []
    for r, t in text_blocks:
        if not t or len(t) > max_chars:
            continue
        if r.x0 < min_x or r.y0 < min_y:
            continue
        if body_rects:
            nearest = min(_rect_distance(r, br) for br in body_rects)
            if nearest < min_distance:
                continue

        padded_rect = fitz.Rect(r.x0 - padding, r.y0 - padding, r.x1 + padding, r.y1 + padding)
        redaction_rects.append(_clamp_rect_to_page(padded_rect, page_rect))

    return redaction_rects


def clean_pdf(input_file):
    """
    CLEANS THE BOTTOM-RIGHT CORNER OF A PDF.
    This is a 'Universal' cleaner that doesn't care about the text.
    It simply whitens out the specified area.
    """
    try:
        doc = fitz.open(input_file)
        modified = False

        for page_index in range(doc.page_count):
            page = doc.load_page(page_index)
            rect = page.rect
            width = rect.width
            height = rect.height

            # Define the area in the bottom-right corner
            # x0, y0, x1, y1
            target_area = fitz.Rect(
                width - REMOVE_WIDTH,    # x0 (left boundary of box)
                height - REMOVE_HEIGHT,  # y0 (top boundary of box)
                width,                   # x1 (right edge of page)
                height                   # y1 (bottom edge of page)
            )

            redaction_rects = [target_area]
            redaction_rects.extend(_find_edge_text_watermark_rects(page))

            for redact_rect in redaction_rects:
                # Create a "Redaction" annotation (White Box)
                # fill=(1, 1, 1) means White color
                page.add_redact_annot(redact_rect, fill=(1, 1, 1))

            # Apply the redactions, effectively removing content underneath
            page.apply_redactions()
            modified = True

        if modified:
            base, ext = os.path.splitext(input_file)
            output_file = f"{base}_clean{ext}"

            # Save efficiently
            doc.save(output_file, garbage=4, deflate=True)
            print(f"[SUCCESS] Cleaned: {input_file} -> {os.path.basename(output_file)}")
        else:
            print(f"[SKIP] No changes needed for: {input_file}")

        doc.close()

    except Exception as e:
        print(f"[ERROR] Could not process {input_file}: {e}")


def main():
    if len(sys.argv) < 2:
        print("Usage: Drag & Drop PDF files onto ResumeUnmark.")
        print("Or: ResumeUnmark.exe <path_to_pdf>")
        input("Press Enter to exit...")
        return

    # Process all dropped files/folders
    # sys.argv[1:] captures all arguments if multiple files are dragged
    for target_path in sys.argv[1:]:
        target_path = target_path.strip('"')

        if os.path.isfile(target_path):
            if target_path.lower().endswith(".pdf"):
                clean_pdf(target_path)
            else:
                print(f"[SKIP] Not a PDF: {target_path}")

        elif os.path.isdir(target_path):
            print(f"Processing folder: {target_path}")
            for root, dirs, files in os.walk(target_path):
                for file in files:
                    if file.lower().endswith(".pdf") and "_clean" not in file:
                        clean_pdf(os.path.join(root, file))

    print("\nAll tasks finished.")


if __name__ == "__main__":
    main()
