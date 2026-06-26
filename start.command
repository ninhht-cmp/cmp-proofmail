#!/usr/bin/env bash
# macOS: bấm đúp file này để mở tool gửi mail (Windows dùng start.bat).
# Chạy chung toàn bộ logic với start.sh để không trùng lặp.
cd "$(dirname "$0")" || exit 1
bash ./start.sh "$@"
