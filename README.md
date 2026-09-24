# Thionline

Ứng dụng thi trực tuyến (Next.js + MongoDB + Cloudinary).

## Chạy thử trên máy
```bash
cp .env.example .env.local   # điền giá trị thật
npm install
npm run dev
```

## Triển khai VPS
```bash
npm ci
npm run build
npm start                     # mặc định cổng 3000; dùng pm2 + nginx (HTTPS) phía trước
```
Nginx cần truyền đúng header để link trong email có đúng tên miền/https:
`proxy_set_header Host $host;` và `proxy_set_header X-Forwarded-Proto $scheme;`.
Tăng `proxy_read_timeout` (ví dụ 120s) cho các route upload và xuất PDF/Word.

Tài liệu nội bộ nằm trong thư mục `docs/`.
