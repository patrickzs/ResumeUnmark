# ResumeUnmark

This is a simple, lightweight tool designed to remove stubborn watermarks and logos from the bottom-right corner of PDF files. It works universally by cleaning the target area, making it effective for resumes, documents, and other PDFs regardless of the specific watermark text.

## Features

- **Universal Removal:** Targets the bottom-right corner area (approx. 2.7" wide x 1" tall), removing any text, logo, or image in that zone.
- **Drag & Drop Simplicity:** No installation required. Just drag your PDF files or folders directly onto the executable.
- **Batch Processing:** Supports processing multiple files or entire folders at once.
- **Optimized Output:** Saves the cleaned PDF with efficient compression, often reducing file size.
- **Privacy Focused:** Runs 100% locally on your machine. No files are uploaded to any server.

## Installation

1. Go to the [Releases](../../releases) page.
2. Download the latest `ResumeUnmark.exe`.
3. Place it anywhere on your computer (e.g., Desktop or Documents).

## How to Use

### Method 1: Drag & Drop

1. Locate your PDF file(s) or a folder containing PDFs.
2. Click and drag them onto the `ResumeUnmark.exe` file.
3. The tool will automatically process the files.
4. A new file ending in `_clean.pdf` will be created in the same location as the original.

### Method 2: Command Line

You can also run the tool from the command prompt:

```bash
ResumeUnmark.exe "path/to/your/file.pdf"
```

## Building from Source

If you prefer to run the Python script directly or build your own executable:

1. **Install Python** (3.6 or higher).
2. **Install Dependencies:**
   ```bash
   pip install pymupdf
   ```
3. **Run the Script:**
   ```bash
   python ResumeUnmark.py "path/to/your/file.pdf"
   ```
4. **Build Executable (Optional):**
   ```bash
   pip install pyinstaller
   pyinstaller --onefile --name "ResumeUnmark" ResumeUnmark.py
   ```

## License

MIT License. Free to use and distribute.



