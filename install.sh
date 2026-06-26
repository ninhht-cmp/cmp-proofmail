#!/usr/bin/env bash
# Cài Proofmail bằng MỘT lệnh (Mac / Linux / Git Bash trên Windows).
#
#   curl -fsSL https://raw.githubusercontent.com/ninhht-cmp/proofmail/main/install.sh | bash
#
# Việc nó làm: clone repo (giữ .git → launcher tự cập nhật về sau) rồi chạy
# launcher để cài thư viện + tạo .env. KHÔNG chứa bí mật nào.
set -e

REPO_URL="https://github.com/ninhht-cmp/proofmail.git"
DEST="${PROOFMAIL_DIR:-$HOME/proofmail}"

if ! command -v git >/dev/null 2>&1; then
  echo "❌ Chưa cài Git. Cài tại https://git-scm.com (để mặc định) rồi chạy lại lệnh này."
  exit 1
fi

if [ -d "$DEST/.git" ]; then
  echo "✓ Đã có Proofmail tại: $DEST — sẽ tự cập nhật khi chạy."
else
  echo "📥 Tải Proofmail về: $DEST"
  git clone "$REPO_URL" "$DEST"
fi

cd "$DEST"
echo "▶ Khởi động Proofmail..."
# Lệnh trên thường chạy qua 'curl | bash' nên stdin của bash là chính script này.
# Lấy đầu vào từ bàn phím (/dev/tty) để các câu hỏi tương tác hoạt động đúng.
if [ -e /dev/tty ]; then
  exec bash start.sh </dev/tty
else
  exec bash start.sh
fi
