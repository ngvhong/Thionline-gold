'use client';

import { useState } from 'react';
import EssayImageLightbox from '@/components/EssayImageLightbox';

// Khối "Phần IV: Tự luận" ở màn kết quả của học sinh: điểm từng câu, nhận xét
// của giáo viên, ảnh bài làm (ưu tiên bản đã chấm) — chạm vào ảnh để xem toàn
// màn hình. Dùng chung cho trang /thi (link) và tab "Đề được giao" (tài khoản).
export default function EssayResultBlock({
  questionIds,
  scores,
  comments,
  images,
  annotated,
  graded,
}: {
  questionIds: string[];
  scores?: Record<string, number> | null;
  comments?: Record<string, string> | null;
  images?: Record<string, string[]> | null;
  annotated?: Record<string, string[]> | null;
  graded: boolean;
}) {
  const [open, setOpen] = useState<{ original: string; annotated?: string | null; title: string } | null>(null);
  const sc = scores || {};
  const cm = comments || {};
  const im = images || {};
  const an = annotated || {};
  if (questionIds.length === 0) return null;

  return (
    <div className="text-left mb-4">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Phần IV: Tự luận</h3>
      {!graded && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
          Giáo viên chưa chấm xong phần này. Quay lại sau để xem điểm và chỗ cần sửa.
        </p>
      )}
      <div className="space-y-2">
        {questionIds.map((qid, i) => {
          const urls = im[qid] || [];
          const annotatedUrls = an[qid] || [];
          const score = sc[qid];
          return (
            <div key={qid} className="border border-gray-200 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-gray-700">Câu {i + 1}</span>
                <span className="text-xs font-semibold text-gray-500">{score !== undefined ? `${score}đ` : 'chưa chấm'}</span>
              </div>
              {urls.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {urls.map((url, idx) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() =>
                        setOpen({
                          original: url,
                          annotated: annotatedUrls[idx] || null,
                          title: `Câu ${i + 1} — trang ${idx + 1}`,
                        })
                      }
                      className="relative"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={annotatedUrls[idx] || url}
                        alt={`Ảnh bài làm câu ${i + 1} - trang ${idx + 1}`}
                        className="w-24 h-24 object-cover rounded-lg border border-gray-200"
                        loading="lazy"
                        decoding="async"
                      />
                      {annotatedUrls[idx] && (
                        <span className="absolute bottom-1 left-1 text-[10px] bg-red-500 text-white rounded px-1">đã chấm</span>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">Chưa nộp ảnh câu này.</p>
              )}
              {cm[qid] && (
                <p className="mt-2 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 whitespace-pre-wrap">
                  <span className="font-semibold">Nhận xét của giáo viên:</span> {cm[qid]}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {open && (
        <EssayImageLightbox original={open.original} annotated={open.annotated} title={open.title} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
