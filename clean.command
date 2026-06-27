#!/usr/bin/env bash
# macOS: bấm đúp file này để dọn file tạm (Windows dùng clean.bat).
# Chạy chung logic với clean.sh để không trùng lặp.
cd "$(dirname "$0")" || exit 1
bash ./clean.sh "$@"
