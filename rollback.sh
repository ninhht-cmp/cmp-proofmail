#!/usr/bin/env bash
# Quay về bản đã dùng TRƯỚC lần cập nhật gần nhất (ghi trong .proofmail-prev-version).
# Dùng khi bản mới chạy được qua test nhưng thực tế vẫn có vấn đề.
cd "$(dirname "$0")" || exit 1

if [ ! -d .git ] || ! command -v git >/dev/null 2>&1; then
  echo "❌ Bản này không cài bằng git — không rollback tự động được."
  read -p "Nhấn Enter để đóng..."
  exit 1
fi
if [ ! -f .proofmail-prev-version ]; then
  echo "ℹ Không có bản trước để quay về (chưa từng cập nhật qua update.sh)."
  echo "  Xem các bản có sẵn:  git tag -l 'v*'"
  echo "  Quay về bản cụ thể:  git checkout v1.0.0 && npm install"
  read -p "Nhấn Enter để đóng..."
  exit 0
fi

PREV=$(cat .proofmail-prev-version)
CURRENT=$(git describe --tags --abbrev=0 2>/dev/null || git rev-parse --short HEAD)
echo "→ Quay về: $CURRENT  →  $PREV"
if ! git checkout --quiet "$PREV" 2>/dev/null; then
  echo "❌ Không quay về được $PREV (bản đó không còn?). Thử: git checkout <tên-bản> && npm install"
  read -p "Nhấn Enter để đóng..."
  exit 1
fi
npm install --omit=dev
echo "✓ Đã quay về $PREV."
read -p "Nhấn Enter để đóng..."
