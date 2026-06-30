# Hướng dẫn cấu hình `.env`

Copy `.env.example` thành `.env`, rồi điền theo hướng dẫn dưới.
**Chỉ phần SMTP là bắt buộc**; các phần còn lại để mặc định vẫn chạy được.

> Mẹo: `.env` không bao giờ được commit lên Git (đã có trong `.gitignore`) — an toàn để chứa mật khẩu.

---

## 1. Tài khoản gửi mail (SMTP) — BẮT BUỘC

### Email tên miền trên Mắt Bão (Email Pro v3)

| Khóa | Điền gì |
|---|---|
| `SMTP_HOST` | `proXX.emailserver.vn` — **thay `proXX` bằng số server của bạn** |
| `SMTP_PORT` | `465` (SSL) hoặc `587` (STARTTLS) |
| `SMTP_SECURE` | `true` nếu cổng 465 · `false` nếu cổng 587 |
| `SMTP_USER` | chính địa chỉ email gửi đi (vd `seller@congty.com`) |
| `SMTP_PASS` | mật khẩu hộp thư — Mắt Bão **KHÔNG** cần App Password như Gmail |

**Lấy số `proXX` ở đâu?** Một trong các nơi: email kích hoạt dịch vụ của Mắt Bão · trang `id.matbao.net` → mục Email · Webmail → phần cấu hình · hoặc hỏi hỗ trợ Mắt Bão 24/7.

### Dùng nhà cung cấp khác (chỉ sửa 4 dòng `SMTP_*`)

| Nhà cung cấp | `SMTP_HOST` | `SMTP_PORT` | `SMTP_SECURE` | Ghi chú |
|---|---|---|---|---|
| Gmail / Workspace | `smtp.gmail.com` | `465` | `true` | Cần **App Password**: bật 2FA rồi tạo tại https://myaccount.google.com/apppasswords |
| Microsoft 365 | `smtp.office365.com` | `587` | `false` | |

---

## 2. Thông tin hiển thị trên mail

| Khóa | Điền gì |
|---|---|
| `MAIL_FROM_NAME` | Tên hiển thị người gửi (vd tên công ty) |
| `MAIL_FROM_EMAIL` | Địa chỉ gửi hiển thị. **Để trống = tự dùng `SMTP_USER`** |
| `MAIL_SUBJECT` | Tiêu đề mặc định. Chỉ dùng 2 biến: `{{seller_name}}`, `{{from_name}}` |
| `MAIL_TEMPLATE` | Mẫu mặc định (file `templates/<tên>.hbs`) |

- **Gõ sai tên biến trong tiêu đề** → tool cảnh báo lúc khởi động (biến lạ sẽ hiển thị TRỐNG).
- **Tiêu đề riêng cho 1 mẫu**: tạo `templates/<tên>.subject.hbs` (vd `templates/followup.subject.hbs`). Không có thì dùng `MAIL_SUBJECT`.
- `MAIL_TEMPLATE` chỉ là mặc định — lúc chạy CLI vẫn cho chọn mẫu (và đổi mẫu giữa phiên). Cờ `--template <tên>` để chọn nhanh không hỏi.

---

## 3. Cách mail rời tool (`MAIL_TRANSPORT`)

| Giá trị | Nghĩa |
|---|---|
| `smtp` (mặc định) | Gửi thẳng qua SMTP (chế độ `--auto` và thủ công 1-1) |
| `outlook-draft` | **Không gửi** — mở sẵn nháp trong **Outlook Classic** (Windows) để bạn xem rồi bấm Gửi tay |

- Chế độ `outlook-draft` chỉ chạy trên **Windows + Outlook "Classic"** (New Outlook / Outlook web không hỗ trợ), và **không cần** `SMTP_HOST/PASS` — chỉ cần `MAIL_FROM_EMAIL`.
- Chạy 1 lần không cần sửa file: `npm start -- --draft`.

---

## 4. Giữ bản sao mail đã gửi

SMTP chỉ **gửi đi**, không tự lưu bản sao vào hộp "Đã gửi". Có 2 lớp giữ lịch sử:

1. **Báo cáo CSV (luôn có, không cần cấu hình)** — lịch sử CHÍNH THỨC ở `output/reports/report-*.csv` sau mỗi đợt (ai, khi nào, thành công/lỗi, Message-ID). Mở bằng Excel, không phụ thuộc mạng nên không bao giờ mất.
2. **Bản sao trong hộp thư** — chọn 1 trong 2:

| Cách | Khóa | Khi nào dùng |
|---|---|---|
| **BCC (khuyến nghị)** | `MAIL_BCC` | Điền **chính địa chỉ của bạn** → mỗi mail kèm 1 bản sao ẩn về hộp thư đó. Đi chung đường SMTP nên tin cậy. Nhiều địa chỉ: ngăn bằng dấu phẩy. |
| **IMAP** (đúng ô "Đã gửi") | `IMAP_SAVE_SENT=true` | Kém ổn trên hosting dùng chung; nếu lỗi liên tục tool **tự tắt** (dựa BCC + CSV). Mắt Bão chỉ cần đặt `true` (dùng chung tài khoản SMTP). |

Chỉ điền các khóa `IMAP_HOST/PORT/SECURE/USER/PASS` **khi máy chủ IMAP khác SMTP**. `IMAP_SENT_FOLDER` để trống = tự dò; chỉ đặt khi dò sai (vd `INBOX.Sent`).

---

## 5. Tốc độ gửi (`MAILS_PER_HOUR`, chỉ áp dụng với `--auto`)

Giới hạn để tránh bị khóa tài khoản: Gmail ~500/ngày · Workspace ~2000/ngày · Microsoft 365 ~30 mail/phút. Gửi số lượng rất lớn → cân nhắc dịch vụ chuyên (Amazon SES / SendGrid), chỉ sửa 4 dòng `SMTP_*`.

---

## 6. Chụp màn hình gian hàng

| Khóa | Ý nghĩa |
|---|---|
| `SCREENSHOT_CONCURRENCY` | Số luồng chụp song song |
| `SHOT_WIDTH` / `SHOT_HEIGHT` | Khung nhìn (desktop) |
| `SHOT_FULL_PAGE` | `true` = chụp toàn trang |
| `SHOT_EMAIL_WIDTH` | Bề rộng ảnh nhúng (giảm dung lượng — Gmail cắt mail >~102KB) |
| `SHOT_QUALITY` | Chất lượng JPEG (1–100) |

---

## 7. Tracking sau gửi (Tầng B — bounce/complaint của ESP)

Đã tách sang `experimental/` (chưa thuộc luồng gửi hiện tại). Chỉ cần khi đổi sang Amazon SES / SendGrid. Xem `experimental/README.md`.

---

## 8. Đăng nhập hệ thống (chỉ cho `npm run enrich`)

Công cụ chụp ảnh website → tải lên hệ thống (xem `HUONG-DAN-ENRICH-ANH.md`) cần đăng nhập
để được phép tải ảnh. **Bỏ qua mục này nếu bạn không dùng công cụ đó.**

| Khóa | Điền gì |
|---|---|
| `CMP_API_BASE_URL` | Địa chỉ máy chủ API. Mặc định `https://api.dev.cmpup.com` |
| `CMP_API_SCOPE` | `internal` (tài khoản nội bộ/admin) hoặc `external` (tài khoản người dùng) |
| `CMP_API_EMAIL` | Email đăng nhập hệ thống |
| `CMP_API_PASSWORD` | Mật khẩu đăng nhập |

- Chưa rõ `internal` hay `external` → hỏi bộ phận kỹ thuật. Sai scope sẽ báo **"Sai tài khoản hoặc mật khẩu"**.
- Công cụ **đăng nhập 1 lần trước khi chạy** để báo lỗi sớm; token tự gia hạn nếu file lớn chạy lâu.
