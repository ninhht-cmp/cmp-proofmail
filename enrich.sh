#!/usr/bin/env bash
# Chụp ảnh website trong file danh sách → tải lên hệ thống → ghi link ảnh vào file kết quả.
# Hỏi từng bước (chọn file, cột URL, tên template) rồi tự chạy. Xem HUONG-DAN-ENRICH-ANH.md.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Chưa cài Node.js. Cài bản LTS tại https://nodejs.org rồi chạy lại."
  read -p "Nhấn Enter để đóng..."
  exit 1
fi
npm run enrich
read -p "Nhấn Enter để đóng..."
