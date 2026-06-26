# 🚀 Hướng dẫn cài Proofmail (chỉ làm 1 lần)

> Cài bằng **một lệnh**. Xong rồi thì **những lần sau chỉ cần bấm 1 nút** — tool tự cập nhật và tự chạy.
> Mất khoảng 5–10 phút. Kẹt ở đâu cứ chụp màn hình gửi quản lý.

## Chuẩn bị (quản lý sẽ gửi cho bạn)
- 🔑 **Thông tin gửi mail**: máy chủ `proXX.emailserver.vn`, email `seller@comacpro.net`, và **mật khẩu hộp thư**.

(Không cần lời mời GitHub nữa — tool tải công khai.)

---

## Bước 1 — Cài Git (phần mềm để tải & cập nhật tool)

**Windows:** Vào **https://git-scm.com** → bấm **Download for Windows** → mở file vừa tải → bấm **Next / Install** liên tục đến hết (cứ để mặc định) → **Finish**.

**Mac:** Mở **Terminal** (bấm `Cmd+Space`, gõ "Terminal"), gõ `git --version` rồi Enter. Nếu hiện bảng đòi cài → bấm **Install**.

## Bước 2 — Tải & cài tool bằng MỘT lệnh

**Windows:** Bấm nút **Start**, gõ **PowerShell**, mở nó. Dán nguyên dòng này (chuột phải để dán) rồi Enter:

```powershell
irm https://raw.githubusercontent.com/ninhht-cmp/proofmail/main/install.ps1 | iex
```

**Mac:** Mở **Terminal**, dán dòng này rồi Enter:

```bash
curl -fsSL https://raw.githubusercontent.com/ninhht-cmp/proofmail/main/install.sh | bash
```

Lệnh sẽ tự tải tool về thư mục **`proofmail`** (trong thư mục người dùng của bạn), cài thư viện (lần đầu **1–2 phút**, cần mạng), rồi **tạo file `.env`** và dừng lại để bạn điền cấu hình.

## Bước 3 — Điền thông tin gửi mail

1. Mở thư mục **`proofmail`** vừa tạo, mở file **`.env`** (bằng **Notepad** / **TextEdit**).
2. Tìm và điền 3 dòng theo thông tin quản lý gửi, rồi **Lưu**:
   ```
   SMTP_HOST=proXX.emailserver.vn        ← thay XX bằng số quản lý cấp
   SMTP_USER=seller@comacpro.net
   SMTP_PASS=<mật khẩu hộp thư>           ← dán mật khẩu quản lý cấp
   ```

## Bước 4 — Chạy tool (và mọi lần sau)

Mở thư mục **`proofmail`**, bấm đúp:
- **Windows:** `start.bat` — nếu hiện cảnh báo xanh "Windows protected your PC" → bấm **More info → Run anyway**.
- **Mac:** `start.command` — nếu bị chặn → **chuột phải vào file → Open → Open**.

Tool sẽ **tự tải bản mới nhất** rồi vào màn hình chọn danh sách. Làm theo hướng dẫn trên màn hình (xem thêm `HUONG-DAN-NHAN-VIEN.md`). ✅
Từ giờ mỗi lần dùng **chỉ cần bấm đúp file đó** — không phải cài lại gì nữa.

---

## ❓ Gặp trục trặc

| Hiện tượng | Cách xử lý |
|---|---|
| "Chua cai Git" khi chạy lệnh ở Bước 2 | Làm lại **Bước 1** (cài Git, để mặc định) → **đóng và mở lại** cửa sổ → dán lệnh lại. |
| "Chua cai Node.js" | Vào **https://nodejs.org** cài bản **LTS** (bấm Next đến hết) → **đóng và mở lại** cửa sổ → chạy lại tool. |
| Đứng lâu ở bước cài lần đầu | Mạng chậm / mạng công ty chặn — cứ chờ. Nếu vẫn lỗi, **không sao**: tool tự dùng **Microsoft Edge / Chrome** có sẵn để chụp. |
| Báo lỗi đăng nhập khi gửi mail | Kiểm tra lại **`SMTP_PASS`** trong `.env` (đúng mật khẩu hộp thư `seller@comacpro.net`). Không có khoảng trắng thừa. |
| Bí quá | Chụp màn hình chỗ lỗi → gửi quản lý. |

> 💡 **Không bao giờ** sửa các file trong thư mục `proofmail` (trừ file `.env` của bạn) — để việc tự cập nhật luôn chạy trơn tru.
