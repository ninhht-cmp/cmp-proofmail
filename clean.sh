#!/usr/bin/env bash
# Dọn file tạm (ảnh chụp gian hàng + cache) để lấy lại dung lượng máy.
# GIỮ NGUYÊN: lịch sử gửi, danh sách chặn (suppression), báo cáo. An toàn chạy bất cứ lúc nào.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Chưa cài Node.js. Cài bản LTS tại https://nodejs.org rồi chạy lại."
  read -p "Nhấn Enter để đóng..."
  exit 1
fi
node scripts/clean.js
read -p "Nhấn Enter để đóng..."
