#!/usr/bin/env bash
# Thêm một email vào danh sách KHÔNG gửi lại (khi người nhận xin hủy đăng ký).
# Hỏi email rồi ghi vào danh sách chặn — địa chỉ đó sẽ không bao giờ bị gửi nữa.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Chưa cài Node.js. Cài bản LTS tại https://nodejs.org rồi chạy lại."
  read -p "Nhấn Enter để đóng..."
  exit 1
fi
npm run suppress
read -p "Nhấn Enter để đóng..."
