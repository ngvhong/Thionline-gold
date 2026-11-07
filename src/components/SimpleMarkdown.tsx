import React from 'react';

// Hiển thị markdown NHẸ cho khung chat "AI hỗ trợ" — KHÔNG dùng thư viện ngoài,
// chỉ tách chuỗi bằng regex đơn giản nên gần như không tốn CPU (và được
// React.memo bọc: chỉ chạy lại khi nội dung tin nhắn đổi, không chạy khi gõ
// chữ ở ô nhập). Hỗ trợ: # tiêu đề, **đậm**, *nghiêng*, `mã`, ``` khối mã ```,
// gạch đầu dòng (- * •), danh sách số (1.), bảng | (hiện dạng chữ, bỏ dòng ---).
// Không chạy HTML thô (React tự escape) nên an toàn.

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // **đậm** | `mã` | *nghiêng* (không có khoảng trắng sát dấu *)
  const re = /(\*\*[^*\n]+\*\*)|(`[^`\n]+`)|((?<![\w*])(?:\*[^\s*][^*\n]*?[^\s*]\*|\*[^\s*]\*)(?![\w*]))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${n++}`;
    if (m[1]) nodes.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else if (m[2])
      nodes.push(
        <code key={key} className="px-1 py-0.5 rounded bg-gray-100 text-[0.85em] font-mono">
          {tok.slice(1, -1)}
        </code>
      );
    else nodes.push(<em key={key}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function SimpleMarkdownImpl({ text }: { text: string }) {
  const lines = (text || '').replace(/\r\n/g, '\n').split('\n');
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const k = `l${i}`;

    // Khối mã ```...```
    if (/^\s*```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++; // bỏ dòng đóng ```
      out.push(
        <pre key={k} className="my-1 p-2 rounded-lg bg-gray-100 text-xs font-mono whitespace-pre-wrap overflow-x-auto">
          {buf.join('\n')}
        </pre>
      );
      continue;
    }

    if (line.trim() === '') {
      out.push(<div key={k} className="h-1.5" />);
      i++;
      continue;
    }

    // Tiêu đề: # ... -> in đậm
    const h = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
    if (h) {
      out.push(
        <div key={k} className="font-bold mt-1">
          {renderInline(h[1].replace(/\s*#+\s*$/, ''), k)}
        </div>
      );
      i++;
      continue;
    }

    // Đường kẻ --- / *** -> bỏ
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      i++;
      continue;
    }

    // Dòng phân cách bảng |---|---| -> bỏ
    if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line) && line.includes('|')) {
      i++;
      continue;
    }

    // Gạch đầu dòng
    const b = /^(\s*)([-*•])\s+(.*)$/.exec(line);
    if (b) {
      const indent = Math.min(4, Math.floor(b[1].length / 2));
      out.push(
        <div key={k} className="flex gap-1.5" style={{ paddingLeft: indent * 12 }}>
          <span aria-hidden>•</span>
          <span className="min-w-0">{renderInline(b[3], k)}</span>
        </div>
      );
      i++;
      continue;
    }

    // Danh sách số
    const num = /^(\s*)(\d+[.)])\s+(.*)$/.exec(line);
    if (num) {
      const indent = Math.min(4, Math.floor(num[1].length / 2));
      out.push(
        <div key={k} className="flex gap-1.5" style={{ paddingLeft: indent * 12 }}>
          <span className="shrink-0">{num[2]}</span>
          <span className="min-w-0">{renderInline(num[3], k)}</span>
        </div>
      );
      i++;
      continue;
    }

    out.push(<div key={k}>{renderInline(line, k)}</div>);
    i++;
  }
  return <>{out}</>;
}

export const SimpleMarkdown = React.memo(SimpleMarkdownImpl);
