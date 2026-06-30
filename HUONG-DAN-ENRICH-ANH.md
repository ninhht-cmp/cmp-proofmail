# Hướng dẫn: Chụp ảnh website → Tải lên hệ thống → Ghi link vào file

Công cụ này nhận một file danh sách (Excel/CSV) có **cột chứa link website**, rồi với mỗi
dòng: **mở web → chụp ảnh → tải ảnh lên hệ thống → ghi link ảnh trở lại file**. File kết
quả dùng để gửi mail tự động.

> Đây là công cụ **riêng**, tách khỏi việc gửi mail. Lệnh chạy: `npm run enrich`.

---

## 1. Chuẩn bị (chỉ làm 1 lần)

1. Đã cài **Node.js LTS** và giải nén thư mục công cụ (giống Proofmail — xem `HUONG-DAN-CAI-DAT.md`).
2. Mở file **`.env`**, điền **tài khoản đăng nhập hệ thống** (4 dòng):

```
CMP_API_BASE_URL=https://api.dev.cmpup.com
CMP_API_SCOPE=internal          # internal = tài khoản nội bộ · external = tài khoản người dùng
CMP_API_EMAIL=ban@congty.com    ← email đăng nhập hệ thống
CMP_API_PASSWORD=mat_khau        ← mật khẩu đăng nhập
```

> Hỏi bộ phận kỹ thuật (Thang Nguyen) nếu chưa rõ nên dùng `internal` hay `external`.
> Mật khẩu để trong `.env` là an toàn — file này không bao giờ bị đẩy lên Git.

## 2. Chuẩn bị file danh sách

- File **`.csv` hoặc `.xlsx`**, có **một cột chứa link website** (vd cột tên `website`,
  `Shop URL`, `link`…). Tên cột **không cần đặt cố định** — công cụ tự nhận diện, hoặc bạn
  chọn lúc chạy.
- Các cột khác (Tên, Email, Ghi chú…) **giữ nguyên** — công cụ không xóa cột nào.
- Ô link để trống hoặc không phải http(s) → công cụ **bỏ qua dòng đó** (không làm hỏng cả file).

## 3. Chạy công cụ

Mở Terminal trong thư mục công cụ, gõ:

```bash
npm run enrich
```

Công cụ sẽ hỏi lần lượt (cứ làm theo):
1. **Chọn file** — file trong `data/` hiện sẵn để chọn, hoặc kéo-thả file vào.
2. **Cột nào chứa URL** — công cụ gợi ý sẵn cột tự nhận diện (thường đúng), bấm Enter là được.
3. **Tên email-template** — gõ tên chiến dịch/mẫu mail (vd `followup`). Tên này chỉ dùng để
   sắp xếp ảnh trên hệ thống.
4. Xem bảng **CHUẨN BỊ** (file, cột, số dòng, số ảnh sẽ xử lý) → xác nhận **Bắt đầu**.

Công cụ chạy: đăng nhập → chụp + tải từng ảnh (có thanh tiến trình) → ghi file kết quả.

### Chạy nhanh không cần hỏi (cho người rành lệnh)

```bash
npm run enrich -- --file=data/danh-sach.csv --template=followup --yes
```

Các cờ tùy chọn: `--url-col=website` (chỉ định cột link), `--image-col=shop_image_url`
(tên cột ghi link, mặc định `shop_image_url`), `--scope=internal|external`,
`--out=...` (đường dẫn file kết quả), `--fresh` (làm lại từ đầu, bỏ qua kết quả cũ).

## 4. File kết quả

- Tạo file mới **`<tên-file-gốc>.enriched.csv`** (hoặc **`.enriched.xlsx`** nếu file gốc là
  Excel) ngay cạnh file gốc — **file gốc giữ nguyên, không bị ghi đè**.
- File `.xlsx` xuất ra gồm đủ dữ liệu + 2 cột mới trên **1 sheet** (không giữ định dạng/nhiều
  sheet của file gốc). Muốn ép kiểu khác: dùng `--out=ketqua.csv` hoặc `--out=ketqua.xlsx`.
- Có thêm 2 cột:
  - **`shop_image_url`** — link ảnh public (dùng để gửi mail).
  - **`shop_image_status`** — trạng thái: `ok`, `bỏ qua (đã có ảnh)`, hoặc `lỗi: ...`.
- File mở được bằng Excel (đã có dấu UTF-8 nên không bị lỗi font tiếng Việt).

## 5. Chạy lại / làm tiếp (resume)

Chạy lại đúng file đó → công cụ **tự bỏ qua dòng đã có link**, chỉ xử lý dòng còn thiếu hoặc
dòng lỗi lần trước. Muốn **làm lại toàn bộ** thì thêm cờ `--fresh`.

> Tiến trình lưu tự động sau mỗi dòng — lỡ tắt giữa chừng, chạy lại là tiếp tục từ chỗ dở.

---

## Gặp trục trặc?

| Hiện tượng | Cách xử lý |
|---|---|
| "Chưa cấu hình tài khoản đăng nhập hệ thống" | Điền `CMP_API_EMAIL` / `CMP_API_PASSWORD` trong `.env`. |
| "Sai tài khoản hoặc mật khẩu hệ thống" | Kiểm tra lại email/mật khẩu và `CMP_API_SCOPE` (`internal` vs `external`). |
| "Không đăng nhập được hệ thống" (mạng) | Kiểm tra mạng và `CMP_API_BASE_URL`. |
| Một số dòng báo `lỗi: chụp lỗi...` | Link đó sai/không mở được → sửa link trong file gốc, chạy lại (chỉ thử lại dòng lỗi). |
| Một số dòng báo `lỗi: tải ảnh lên S3...` | Lỗi tạm thời phía hệ thống → chạy lại lệnh để thử lại các dòng lỗi. |
| "Không thấy file" | Kiểm tra đường dẫn file, hoặc bỏ file vào thư mục `data/`. |

## Ảnh chụp như thế nào?

- Chụp **khung nhìn đầu trang** (phần đầu gian hàng), ảnh **JPEG** sắc nét, dung lượng nhẹ.
- Muốn chụp **toàn trang** thì đặt `SHOT_FULL_PAGE=true` trong `.env`. Các thông số ảnh khác
  (kích thước, chất lượng) dùng chung cấu hình mục "Chụp màn hình" trong `HUONG-DAN-CAU-HINH-ENV.md`.

---
*Cần giúp thêm: liên hệ quản lý / bộ phận kỹ thuật.*
