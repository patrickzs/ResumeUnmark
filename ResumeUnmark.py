import fitz  # PyMuPDF
import os
import sys


def clean_pdf(input_file):
    """
    CLEANS THE BOTTOM-RIGHT CORNER OF A PDF.
    This is a 'Universal' cleaner that doesn't care about the text.
    It simply whitens out the specified area.
    """
    try:
        doc = fitz.open(input_file)
        modified = False

        # --- CONFIGURATION (Adjust these if needed) ---
        # 1 point = 1/72 inch
        # 200 points ~ 2.7 inches wide
        # 70 points ~ 1 inch tall
        # These values target a standard bottom-right watermark
        REMOVE_WIDTH = 200
        REMOVE_HEIGHT = 70
        # -----------------------------------------------

        for page in doc:
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

            # Create a "Redaction" annotation (White Box)
            # fill=(1, 1, 1) means White color
            page.add_redact_annot(target_area, fill=(1, 1, 1))
            modified = True

            # Apply the redaction effectively removing content underneath
            page.apply_redactions()

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
