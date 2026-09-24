import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  // @resvg/resvg-js là package native (Rust, biên dịch ra file
  // .node riêng theo từng OS/CPU — xem src/lib/examDocxExport.ts, dùng để
  // rasterize SVG (hình TikZ) -> PNG khi xuất Word/PDF). Bên trong nó
  // require() động file .node đúng theo OS lúc chạy, webpack (Next.js dùng
  // để bundle code server) không dò tĩnh được việc này nên báo lỗi
  // "could not resolve @resvg/resvg-js-win32-x64-msvc into a module".
  //
  // svgo (dùng trong src/lib/tikzCrop.ts để nén SVG TikZ) bị lỗi tương tự:
  // import 'svgo' kéo theo toàn bộ builtin plugin của nó (kể cả những
  // plugin không dùng tới), trong đó vài plugin import css-tree — mà
  // css-tree lại require() động file data/patch.json. Nếu để webpack
  // bundle svgo, Vercel's output file tracing không dò được require()
  // động này -> không copy patch.json vào server function -> lỗi runtime
  // "Cannot find module '../data/patch.json'" ở PRODUCTION (không lỗi lúc
  // `next build`/`next dev` ở máy, vì máy có sẵn node_modules đầy đủ).
  // Bug đã được xác nhận ở phía svgo/css-tree, chưa có bản vá:
  // https://github.com/svg/svgo/issues/2149
  //
  // Khai báo cả 2 ở đây để Next.js KHÔNG bundle qua webpack, mà để
  // Node.js tự require() bình thường lúc chạy (lúc đó mới tìm đúng file
  // đã cài trong node_modules, kể cả file .node theo OS lẫn patch.json).
  serverExternalPackages: ["@resvg/resvg-js", "svgo"],
};

export default nextConfig;
