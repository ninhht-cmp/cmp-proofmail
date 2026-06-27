#!/usr/bin/env bash
# macOS: bấm đúp file này để thêm email vào danh sách không gửi (Windows dùng suppress.bat).
# Chạy chung logic với suppress.sh để không trùng lặp.
cd "$(dirname "$0")" || exit 1
bash ./suppress.sh "$@"
