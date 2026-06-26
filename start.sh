#!/usr/bin/env bash
# Bấm đúp file này (hoặc chạy ./start.sh) để mở tool gửi mail.
cd "$(dirname "$0")" || exit 1

# --- Kiểm tra cập nhật: CHỈ BÁO, KHÔNG tự đổi code ---
# Mô hình ghim-tag: máy này chạy đúng bản (release tag) đang ghim. Muốn lên bản
# mới thì chạy ./update.sh (có chạy test + tự quay về bản cũ nếu lỗi). Bước dưới
# chỉ fetch tag để báo "có bản mới" — read-only, offline thì bỏ qua êm.
if [ -d .git ] && command -v git >/dev/null 2>&1; then
  git fetch --tags --quiet 2>/dev/null || true
  CURRENT=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
  LATEST=$(git tag -l 'v*' --sort=-v:refname 2>/dev/null | head -n1)
  if [ -n "$LATEST" ] && [ "$LATEST" != "$CURRENT" ]; then
    echo "ℹ Có bản mới: $LATEST (đang dùng ${CURRENT:-bản chưa gắn thẻ})."
    echo "  → Chạy ./update.sh để cập nhật (tự kiểm tra; lỗi thì tự quay về bản cũ)."
  fi
fi

# --- Node.js: phải có và đủ phiên bản (>= 20) ---
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Chưa cài Node.js. Tải tại https://nodejs.org (bản LTS) rồi chạy lại."
  read -p "Nhấn Enter để đóng..."
  exit 1
fi
# Để chính node so sánh phiên bản (tránh parse chuỗi mong manh trong shell).
if ! node -e "process.exit(+process.versions.node.split('.')[0] >= 20 ? 0 : 1)" 2>/dev/null; then
  echo "❌ Node.js quá cũ ($(node -v)). Cần phiên bản 20 trở lên."
  echo "   Tải bản LTS mới tại https://nodejs.org rồi chạy lại."
  read -p "Nhấn Enter để đóng..."
  exit 1
fi

# --- Thư viện: cài khi chưa có HOẶC package.json đổi so với lần cài trước ---
STAMP="node_modules/.pkg-stamp"
if [ ! -d node_modules ] || ! cmp -s package.json "$STAMP" 2>/dev/null; then
  echo "⏳ Cài đặt / cập nhật thư viện (có thể mất 1-2 phút)..."
  # --omit=dev: máy nhân viên chỉ cần thư viện CHẠY THẬT, không cần bộ công cụ
  # dev (eslint/prettier/typescript) — nhẹ hơn, nhanh hơn, ít bề mặt tấn công.
  # CI/dev cài đầy đủ bằng `npm ci`.
  if ! npm install --omit=dev; then
    echo "❌ Cài đặt thư viện lỗi (kiểm tra mạng/proxy) rồi chạy lại."
    read -p "Nhấn Enter để đóng..."
    exit 1
  fi
  # Tải Chromium — KHÔNG bắt buộc: nếu lỗi (proxy/mạng) tool sẽ tự dùng
  # Microsoft Edge / Google Chrome có sẵn trên máy.
  if ! npx playwright install chromium; then
    echo "⚠  Không tải được Chromium (có thể do mạng/proxy). Không sao —"
    echo "   tool sẽ tự dùng Microsoft Edge hoặc Google Chrome có sẵn trên máy."
  fi
  cp package.json "$STAMP"
fi

# --- Biên dịch TypeScript -> dist (incremental: gần như tức thì khi nguồn không đổi) ---
# tsc là dependency (pure-JS, không tải binary) nên luôn có sẵn dù cài --omit=dev.
# Build mỗi lần để dist luôn khớp nguồn (kể cả sau update/rollback) mà vẫn nhanh.
if ! npm run build; then
  echo "❌ Biên dịch lỗi. Chạy ./update.sh để về bản chạy được, hoặc báo người phụ trách."
  read -p "Nhấn Enter để đóng..."
  exit 1
fi

# --- Cấu hình .env: tạo từ mẫu nếu chưa có rồi dừng để nhân viên điền SMTP ---
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "⚙️  Đã tạo file cấu hình '.env'. Hãy mở nó, điền tài khoản gửi mail (SMTP),"
  echo "    lưu lại rồi chạy lại file này. (Xem README mục cấu hình.)"
  read -p "Nhấn Enter để đóng..."
  exit 0
fi

node dist/cli/main.js "$@"
echo ""
read -p "Xong. Nhấn Enter để đóng..."
