# ==========================================================================
# ĐOẠN THÊM VÀO app.py — dán NGAY SAU route /export-docx đã có (trong CẢ
# HAI Space "carot2026-tikz" và "hong-2-m2w-tikz-compiler", vì 2 Space này
# đang chạy chung 1 bản app.py).
#
# Đối xứng gần như 100% với /export-docx: chỉ khác bước cuối cùng gọi
# pandoc với "--pdf-engine=xelatex -t pdf" (cần xelatex, ĐÃ CÓ SẴN trên
# Space này rồi vì route /compile cũng dùng xelatex để biên dịch TikZ).
# ==========================================================================

class ExportPdfRequest(BaseModel):
    markdown: str
    images: Optional[Dict[str, str]] = None
    title: Optional[str] = "exam"


@app.post("/export-pdf")
def export_pdf(req: ExportPdfRequest, x_export_secret: str = Header(default="")):
    if EXPORT_SECRET and x_export_secret != EXPORT_SECRET:
        raise HTTPException(status_code=401, detail="Sai hoặc thiếu x-export-secret")

    if not req.markdown.strip():
        raise HTTPException(status_code=400, detail="Nội dung markdown trống")

    job_id = uuid.uuid4().hex[:12]
    job_dir = WORK_DIR / job_id
    job_dir.mkdir(exist_ok=True)

    try:
        _write_export_files(job_dir, req.markdown, req.images)
        out_file = job_dir / "output.pdf"

        result = subprocess.run(
            [
                "pandoc",
                "input.md",
                "-f", "markdown+tex_math_dollars+raw_attribute",
                "-t", "pdf",
                "--pdf-engine=xelatex",
                # Cùng bộ gói LaTeX/font hỗ trợ tiếng Việt như phần TikZ
                # dùng ở /compile — nếu app.py có sẵn 1 file .tex "header"
                # dùng chung font/gói cho toàn bộ Space, có thể thêm
                # "-H", "<đường-dẫn-file-header.tex>" vào đây để đồng bộ
                # font chữ Việt hoá giữa hình TikZ và văn bản đề thi.
                "-V", "geometry:margin=2cm",
                "-o", str(out_file),
            ],
            cwd=str(job_dir),
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=90,
        )

        if not out_file.exists():
            log = result.stdout.decode("utf-8", errors="replace")[-2000:]
            return JSONResponse(status_code=400, content={"error": "Lỗi pandoc/xelatex khi dựng file PDF", "log": log})

        data = out_file.read_bytes()
        return Response(
            content=data,
            media_type="application/pdf",
        )
    except subprocess.TimeoutExpired:
        return JSONResponse(status_code=504, content={"error": "pandoc/xelatex chạy quá lâu (timeout)"})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        shutil.rmtree(job_dir, ignore_errors=True)
