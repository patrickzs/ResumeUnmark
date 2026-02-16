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
    max_chars: int = 40,
    padding: float = 2.0,
) -> list[fitz.Rect]:
    """
    Finds small "edge/footer" text blocks in the right-side whitespace.
    
    New Robust Heuristic (matching web version):
    1. Body content = text blocks starting in the LEFT half of the page (x < 50%).
    2. Watermark = small text blocks in the RIGHT half (x >= 50%) that are
       BELOW the bottom of the last body content.
    """
    page_rect = page.rect
    half_width = page_rect.width * 0.5
    
    # Get all text blocks: (x0, y0, x1, y1, "text", block_no, block_type)
    blocks = page.get_text("blocks") or []
    
    # 1. Find the bottom of the "body" content (all text starting on the left)
    last_body_y = 0.0
    
    for b in blocks:
        x0, y0, x1, y1, text, _, block_type = b[:7]
        if block_type != 0:  # ignore images/graphics for body text calculations
            continue
        
        # If block starts on the left side, it's part of the main document body
        if x0 < half_width:
            if text.strip(): # only count non-empty text
                last_body_y = max(last_body_y, y1)

    redaction_rects: list[fitz.Rect] = []
    
    # 2. Find candidates on the right side that are below the body content
    for b in blocks:
        x0, y0, x1, y1, text, _, block_type = b[:7]
        text = (text or "").strip()
        
        # Must be text
        if block_type != 0 or not text:
            continue
            
        # Must be small (watermark-like)
        # remove spaces to verify length
        if len(text.replace(" ", "")) > max_chars:
            continue
            
        # Must be on the RIGHT side
        if x0 < half_width:
            continue
            
        # Must be BELOW the last line of the main body
        if y0 < last_body_y:
            continue
            
        # If it passes, mark it for redaction
        r = fitz.Rect(x0, y0, x1, y1)
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
