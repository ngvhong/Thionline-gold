import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI as string;

if (!MONGODB_URI) {
  throw new Error(
    '⚠️ Thiếu biến môi trường MONGODB_URI. Hãy thêm vào file .env.local, ví dụ:\nMONGODB_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/examdb'
  );
}

// Next.js dev mode load lại module liên tục (hot reload) — nếu không cache
// connection theo global, mỗi lần reload sẽ mở thêm 1 kết nối mới tới
// MongoDB, nhanh chóng vượt quá giới hạn connection cho phép (đặc biệt với
// gói free của MongoDB Atlas). Cache trên `global` để dùng lại đúng 1
// connection xuyên suốt các lần hot-reload.
let cached = (global as any)._mongoose;

if (!cached) {
  cached = (global as any)._mongoose = { conn: null, promise: null };
}

export async function connectToDatabase() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        bufferCommands: false,
      })
      .then((m) => m);
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
