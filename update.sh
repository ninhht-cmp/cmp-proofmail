#!/usr/bin/env bash
# Cập nhật tool lên bản phát hành (release tag) mới nhất — AN TOÀN:
# ghi nhớ bản đang dùng → đổi sang bản mới → cài thư viện → CHẠY TEST.
# Nếu test lỗi thì TỰ QUAY VỀ bản cũ ngay (bản đang chạy-OK không bị hỏng).
# Muốn quay về bằng tay sau này: ./rollback.sh
cd "$(dirname "$0")" || exit 1

if [ ! -d .git ] || ! command -v git >/dev/null 2>&1; then
  echo "❌ Bản này không cài bằng git (hoặc máy chưa có git) — không tự cập nhật được."
  read -p "Nhấn Enter để đóng..."
  exit 1
fi

echo "⏳ Đang lấy danh sách bản phát hành..."
git fetch --tags --quiet || { echo "❌ Không kết nối được (mạng/proxy). Thử lại sau."; read -p "Nhấn Enter để đóng..."; exit 1; }

CURRENT=$(git describe --tags --abbrev=0 2>/dev/null || git rev-parse --short HEAD)
LATEST=$(git tag -l 'v*' --sort=-v:refname | head -n1)

if [ -z "$LATEST" ]; then
  echo "ℹ Chưa có bản phát hành (tag) nào để cập nhật."
  read -p "Nhấn Enter để đóng..."
  exit 0
fi
if [ "$LATEST" = "$CURRENT" ]; then
  echo "✓ Đang ở bản mới nhất ($CURRENT). Không cần cập nhật."
  read -p "Nhấn Enter để đóng..."
  exit 0
fi

echo "→ Cập nhật: $CURRENT  →  $LATEST"
# Lưu bản hiện tại để rollback (kể cả khi auto-rollback bên dưới thất bại).
echo "$CURRENT" > .proofmail-prev-version

if ! git checkout --quiet "$LATEST" 2>/dev/null; then
  echo "❌ Không đổi được sang $LATEST — có thể bạn đã sửa file trong thư mục cài đặt."
  echo "   (Đừng sửa trực tiếp code ở đây; cấu hình nằm ở .env — file đó an toàn.)"
  read -p "Nhấn Enter để đóng..."
  exit 1
fi

echo "⏳ Cài thư viện cho bản mới..."
npm install --omit=dev || { echo "⚠ Cài thư viện lỗi — quay về $CURRENT."; git checkout --quiet "$CURRENT"; npm install --omit=dev; read -p "Nhấn Enter để đóng..."; exit 1; }

echo "⏳ Kiểm tra bản mới (chạy test)..."
if npm test; then
  echo "✓ Cập nhật thành công lên $LATEST."
else
  echo "✗ Bản $LATEST KHÔNG đạt kiểm tra — tự quay về bản cũ $CURRENT."
  git checkout --quiet "$CURRENT"
  npm install --omit=dev
  echo "✓ Đã quay về $CURRENT (bản chạy ổn trước đó). Báo người phụ trách về lỗi của $LATEST."
fi
read -p "Nhấn Enter để đóng..."
