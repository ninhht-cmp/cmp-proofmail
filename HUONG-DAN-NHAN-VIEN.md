# Hướng dẫn dùng Proofmail (cho nhân viên)

Công cụ gửi email kèm ảnh gian hàng cho từng người bán. Bạn **không cần biết kỹ thuật** — chỉ bấm chuột và điền.

---

## 1. Chuẩn bị (chỉ làm 1 lần)

1. **Cài Node.js**: vào https://nodejs.org → tải bản **LTS** → cài như phần mềm bình thường.
2. **Giải nén** thư mục Proofmail (file zip được gửi) ra một chỗ cố định (vd: Desktop). Đừng để trong file zip.

## 2. Mở công cụ

- **Mac**: bấm đúp **`start.command`**
  *(lần đầu Mac chặn → chuột phải vào file → **Open** → **Open**)*
- **Windows**: bấm đúp **`start.bat`**

**Lần đầu chạy** sẽ:
- Tự cài đặt (1–2 phút, cần mạng) — cứ chờ.
- Tạo file cấu hình **`.env`** rồi dừng lại. → Mở `.env`, **điền tài khoản gửi mail**, **lưu**, rồi bấm đúp launcher lại.

### Điền `.env` với email Outlook / Microsoft 365 (email công ty)

Mở file `.env`, sửa **5 dòng** này:

```
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=ban@congty.com          ← email công ty của bạn
SMTP_PASS=mat_khau_email           ← mật khẩu email (xem lưu ý dưới)
```

Lưu ý quan trọng (báo bộ phận IT/quản lý nếu gửi không được):
- **Phải bật "Authenticated SMTP"** cho hộp thư này trong Microsoft 365 Admin
  *(Users → chọn người → Mail → Manage email apps → tick **Authenticated SMTP**)*.
- Nếu email bật **xác thực 2 lớp (MFA)**: không dùng mật khẩu thường — tạo **App password** rồi dán vào `SMTP_PASS`.
- Email **outlook.com / hotmail** cá nhân thì `SMTP_HOST=smtp-mail.outlook.com` (port vẫn 587).

> Mở file `.env` bằng Notepad (Windows) hoặc TextEdit (Mac). Sửa xong nhớ **Lưu (Ctrl/Cmd + S)**.

## 3. Chuẩn bị danh sách người bán

File Excel/CSV cần **đúng 3 cột bắt buộc** (tên cột viết y như vầy):

| Name | Email | Shop URL |
|---|---|---|
| Tên người bán | Email nhận | Link gian hàng trên comacpro.net |

- Muốn thêm cột nào khác (Phone, Ghi chú…) → **thoải mái**, công cụ tự bỏ qua.
- Thiếu 1 trong 3 cột → công cụ **báo lỗi và không cho gửi**.

## 4. Gửi mail

1. Mở công cụ → chọn **nguồn danh sách**:
   - File trong thư mục `data/`, hoặc
   - **Dán link Google Sheets** (sheet phải để chế độ *"Anyone with the link can view"*), hoặc
   - Kéo-thả file vào cửa sổ.
2. Màn hình hiện danh sách người bán → **gõ để lọc**, dùng phím **↑ ↓** chọn 1 người → Enter.
3. Công cụ tự chụp gian hàng → hỏi xác nhận → bạn chọn **Yes** để gửi.
4. Gửi xong, người đó **tự biến mất** khỏi danh sách (đã gửi). Làm tiếp người khác.
5. Xong/nghỉ thì chọn **"— Thoát —"**.

## 5. Lần sau làm tiếp (resume)

Mở lại công cụ → chọn **đúng nguồn cũ** (cùng file / cùng link Google Sheet). Những người **đã gửi sẽ tự ẩn**, chỉ còn người chưa gửi. Cứ làm tiếp.

> Kết quả gửi (ai, lúc nào, thành công/lỗi) lưu ở thư mục **`output/reports/`** (mở bằng Excel).

---

## Gặp trục trặc?

| Hiện tượng | Cách xử lý |
|---|---|
| "Chưa cài Node.js" | Cài Node.js LTS (mục 1) rồi mở lại. |
| Mac không mở được `.command` | Chuột phải → **Open** → **Open** (chỉ lần đầu). |
| "Không kết nối được máy chủ gửi mail" (Outlook) | Báo IT **bật Authenticated SMTP** cho hộp thư; nếu có MFA thì dùng **App password**. Kiểm tra lại 5 dòng SMTP trong `.env`. |
| "File thiếu cột bắt buộc" | Kiểm tra file có đủ 3 cột **Name, Email, Shop URL**. |
| "Chụp gian hàng lỗi — CHƯA gửi" | Link gian hàng (Shop URL) sai/không mở được → sửa link, công cụ vẫn giữ người đó để thử lại. |
| Sheet không tải được | Đặt Google Sheet ở chế độ **"Anyone with the link can view"**. |

## Khi có bản cập nhật

**Không phải làm gì cả.** Cứ **bấm launcher như thường** — tool **tự tải bản mới nhất** rồi chạy.
- Cấu hình `.env` và lịch sử đã-gửi được **giữ nguyên** (không gửi trùng).
- Nếu bản mới cần thư viện mới, công cụ **tự cài lại** ở lần mở kế tiếp (chờ 1–2 phút) — bạn **không cần làm gì thêm**.

## Máy đầy dung lượng?

Bấm đúp **`clean.bat`** (Windows) / **`clean.command`** (Mac) để xóa **ảnh chụp gian hàng + file cache** tạm, lấy lại dung lượng. **An toàn:** lịch sử đã-gửi và danh sách không-gửi-lại **giữ nguyên** (không gửi trùng); lần sau tool tự chụp lại ảnh khi cần.

## Có người xin "hủy nhận mail" (unsubscribe)?

Khi một người bán trả lời xin **ngừng nhận email**: bấm đúp **`suppress.bat`** (Windows) / **`suppress.command`** (Mac) → **nhập email của họ** → Enter. Từ đó tool **không bao giờ gửi cho địa chỉ đó nữa**. Hãy làm ngay để tránh bị báo spam.

---
*Cần giúp thêm: liên hệ quản lý / bộ phận kỹ thuật.*
