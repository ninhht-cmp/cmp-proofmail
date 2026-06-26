# NGHIỆP VỤ & YÊU CẦU HỆ THỐNG: Proofmail — Web app gửi email cá nhân hoá hàng loạt cho nhà cung cấp

> **Mục đích tài liệu:** Đây là bản đặc tả nghiệp vụ (business requirement) dùng để giao cho lập trình viên hoặc AI coding agent (Claude Code, Cursor…) build hệ thống. Đọc xong tài liệu này, người/agent thực thi phải hiểu được *vì sao làm*, *làm cái gì*, *ràng buộc gì*, và *thế nào là làm xong đúng*.
>
> **Phiên bản 2 — kiến trúc web app.** Người dùng cuối là **nhân viên sale/seller (không có kỹ năng lập trình)**, dùng hằng ngày. Vì vậy hệ thống là một **ứng dụng web**: nhân viên đăng nhập, upload file danh sách, xem trước, bấm gửi; toàn bộ việc chụp màn hình, ghép template và gửi mail chạy **nền trên server** (sale tắt máy mail vẫn gửi tiếp). Đây là điểm khác biệt cốt lõi so với một script chạy bằng dòng lệnh.

---

## 1. BỐI CẢNH NGHIỆP VỤ (Business Context)

Chúng tôi vận hành một gian hàng bán lẻ (online shop) phân phối sản phẩm của hơn **1.000 nhà cung cấp** (NCC). Một hoạt động thường xuyên là **thông báo cho từng NCC rằng sản phẩm của họ đang được bày bán trên gian hàng của chúng tôi**, kèm bằng chứng trực quan (ảnh chụp gian hàng) và đường dẫn tới sản phẩm để NCC kiểm tra.

Mục tiêu kinh doanh của việc gửi email này:
- Tạo niềm tin và minh bạch với NCC (họ thấy sản phẩm của mình đang được bán thật).
- Thúc đẩy NCC tiếp tục cấp hàng / mở rộng hợp tác.
- Chuyên nghiệp hoá hình ảnh thương hiệu của shop.

---

## 2. HIỆN TRẠNG & VẤN ĐỀ (Current State & Problem)

### 2.1. Quy trình thủ công hiện tại
Với **mỗi** NCC, nhân sự đang phải lặp lại các bước sau bằng tay:
1. Mở một file template thiết kế (design) có sẵn.
2. Sửa tên NCC vào đúng vị trí trên design.
3. Mở trang gian hàng, **chụp màn hình (screenshot)** khu vực đang bán sản phẩm của NCC đó.
4. Chèn ảnh screenshot vào design.
5. Gắn đường link sản phẩm vào design.
6. Xuất ra ảnh và gửi email cho NCC.

### 2.2. Vấn đề cốt lõi (Root Cause)
- **Lặp thủ công ở quy mô lớn:** với >1.000 NCC, mỗi người phải sửa tên + chụp + ghép ảnh + gắn link riêng → tiêu tốn cực nhiều thời gian và công sức.
- **Sai lệch chất lượng (design drift):** vì phải chỉnh sửa thủ công quá nhiều lần, thiết kế dễ bị lệch, sai font, sai vị trí, thiếu nhất quán giữa các email.
- **Không mở rộng được:** quy trình này không thể scale; càng nhiều NCC càng tắc nghẽn.

### 2.3. Điểm nghẽn lớn nhất
- Bước **chụp màn hình gian hàng + ghép vào design thủ công** là khâu tốn thời gian nhất và là nguồn gây sai lệch chính.
- **Người vận hành là nhân viên sale, không phải kỹ thuật viên.** Một công cụ chạy bằng dòng lệnh sẽ không dùng được trong thực tế: sale không gõ lệnh được, mỗi lần lỗi lại phải nhờ dev. Bắt buộc phải có **giao diện đồ hoạ thân thiện**.
- **Tác vụ gửi kéo dài hàng giờ.** Vì phải điều tiết tốc độ (throttle) để tránh bị khoá tài khoản, gửi cho 1.000+ NCC mất nhiều giờ. Không thể bắt nhân viên ngồi mở máy chờ suốt; việc gửi phải **chạy nền trên server**.

---

## 3. MỤC TIÊU (Goals)

### 3.1. Mục tiêu chức năng
Xây dựng một **ứng dụng web** tự động hoá **toàn bộ** quy trình ở mục 2.1, sao cho:
- Nhân viên sale chỉ cần: đăng nhập → **upload file danh sách NCC** (xuất từ Excel/Google Sheets) → xem trước → bấm gửi.
- Hệ thống tự chụp gian hàng, sinh nội dung cá nhân hoá và gửi email tới từng NCC, **không cần thao tác thủ công cho từng người và không cần kỹ năng lập trình**.
- Việc gửi chạy nền; nhân viên có thể đóng trình duyệt/tắt máy, hệ thống vẫn gửi tiếp và lưu lại kết quả.

### 3.2. Mục tiêu chất lượng (định lượng được)
| Tiêu chí | Hiện tại (thủ công) | Mục tiêu |
|---|---|---|
| Thời gian xử lý 1 NCC | vài phút/người | tự động, ~giây/người |
| Thời gian thao tác của sale cho cả đợt 1.000 NCC | nhiều ngày công | upload 1 file + 1 lần bấm |
| Độ nhất quán thiết kế | dễ lệch | 100% đồng nhất (sinh từ 1 template) |
| Khả năng chạy lại | làm lại từ đầu | chạy lại bất kỳ lúc nào, có cache |
| Yêu cầu kỹ năng người dùng | thủ công, dễ sai | không cần kỹ thuật, chỉ dùng trình duyệt |
| Giám sát tiến trình & kết quả | không có | xem được trạng thái + lịch sử từng đợt |

### 3.3. Phi mục tiêu (Out of Scope — để tránh over-engineering)
- Không xây CRM hay hệ thống quản lý NCC đầy đủ. Danh sách NCC vẫn nhập bằng file upload, hệ thống không tự đồng bộ kho dữ liệu NCC.
- Không xử lý phản hồi/đặt hàng từ NCC (đây chỉ là công cụ gửi đi một chiều).
- Phiên bản đầu **không cần** tính năng nâng cao như: lập lịch gửi tự động định kỳ, A/B testing nội dung, thống kê tỷ lệ mở mail (open-rate) chi tiết. Có thể bổ sung sau.
- *Lưu ý:* giao diện web cho nhân viên **nay nằm TRONG phạm vi** (khác với bản v1). Nhưng giữ giao diện **tối giản, đúng việc** — chỉ cần upload, xem trước, gửi, xem lịch sử; không làm dashboard phức tạp.

---

## 4. YÊU CẦU CHỨC NĂNG (Functional Requirements)

### FR-0: Giao diện web cho nhân viên sale (trọng tâm)
- Hệ thống là một **ứng dụng web** truy cập bằng trình duyệt, có **đăng nhập** (mỗi nhân viên một tài khoản).
- Màn hình chính cho phép nhân viên:
  1. **Upload file danh sách NCC** bằng kéo-thả hoặc chọn file (hỗ trợ CSV; nên hỗ trợ thêm Excel .xlsx vì sale hay export Excel).
  2. **Xem trước (preview)** sau khi upload: bảng tóm tắt số NCC hợp lệ / bị bỏ qua, và **xem thử một email mẫu** (render thật từ template với dữ liệu dòng đầu) để chắc chắn đúng trước khi gửi.
  3. **Bấm một nút để bắt đầu gửi** cả đợt.
  4. **Theo dõi tiến trình theo thời gian thực**: đã gửi bao nhiêu / còn lại bao nhiêu / lỗi bao nhiêu, không cần mở máy chờ — có thể đóng trình duyệt rồi quay lại xem sau.
- Giao diện phải đơn giản, rõ ràng, dùng được bởi người **không có kiến thức kỹ thuật**; thông báo lỗi viết bằng ngôn ngữ đời thường (ví dụ "File thiếu cột email", không phải mã lỗi kỹ thuật).

### FR-1: Nhập & kiểm tra dữ liệu nhà cung cấp
- Nhân viên **upload file** danh sách NCC (CSV xuất từ Google Sheets/Excel; nên hỗ trợ cả .xlsx).
- Mỗi NCC gồm 3 trường: **tên NCC**, **email**, **link gian hàng (shop_url)**. Nút bấm trong email trỏ thẳng tới `shop_url` để NCC truy cập gian hàng.
- Hệ thống phải **kiểm tra hợp lệ (validate) ngay khi upload** và hiển thị kết quả cho nhân viên: dòng nào thiếu email hoặc link gian hàng thì bỏ qua và **báo rõ ngay trên giao diện** (dòng số mấy, thiếu gì), không làm hỏng cả đợt.

### FR-2: Tự động chụp màn hình gian hàng
- Với mỗi NCC, hệ thống **tự động mở link gian hàng và chụp màn hình** (không cần người chụp tay).
- Phải xử lý được trang web hiện đại: chờ trang tải xong, kích hoạt phần tải-trễ (lazy-load) bằng cách cuộn nhẹ trước khi chụp.
- Ảnh chụp phải **nét** (độ phân giải cao / retina @2x).
- Hỗ trợ cấu hình kích thước vùng chụp và chế độ chụp (chỉ vùng nhìn thấy hoặc toàn trang).
- **Có cache:** nếu đã chụp rồi thì lần chạy sau không chụp lại (tiết kiệm thời gian khi chạy lại).

### FR-3: Sinh nội dung cá nhân hoá từ 1 template duy nhất
- Có **một** file template thiết kế dùng chung. Mọi thay đổi design chỉ sửa ở **một nơi**.
- Template chứa các biến động: **tên NCC**, **link sản phẩm**, tên shop gửi đi.
- Hệ thống đổ dữ liệu của từng NCC vào template để tạo nội dung riêng cho từng người.
- **Yêu cầu chống design drift:** vì mọi email sinh ra từ cùng một template bằng code (deterministic), thiết kế phải đồng nhất tuyệt đối giữa tất cả NCC.

### FR-4: Đầu ra đa định dạng từ cùng một template
Cùng một template phải sinh ra nhiều phần, để không bao giờ lệch nhau:
- **(a) Email HTML** — là định dạng chính. Link sản phẩm phải **bấm được**, hiển thị sắc nét trên mọi thiết bị, ảnh gian hàng nhúng trực tiếp trong email. **(Đã làm.)**
- **(b) Bản plain-text đi kèm** — phần `text/plain` sinh từ cùng nguồn (`templates/<tên>.txt.hbs`), để tương thích mọi trình đọc và giảm điểm spam. **(Đã làm.)**
- **(c) Ảnh PNG toàn-email** — *nice-to-have, ĐÃ HOÃN.* Ban đầu dự kiến đính kèm bản PNG render toàn bộ email cho trình email không đọc HTML. **Trade-off:** render HTML→PNG cho từng NCC tốn thời gian + làm mail nặng (hại deliverability), trong khi gần như mọi email client hiện đại đều render HTML tốt. Vì vậy hiện **chỉ nhúng ảnh gian hàng inline** trong email HTML; chưa sinh PNG toàn-email. Chỉ làm lại nếu có nhu cầu thực tế đo được.

### FR-5: Gửi email hàng loạt
- Hệ thống gửi email tới từng NCC qua giao thức email tiêu chuẩn (SMTP), cấu hình được nhà cung cấp gửi (Gmail/Workspace, hoặc dịch vụ chuyên dụng như Amazon SES, SendGrid, Resend…).
- **Tiêu đề và nội dung email cũng phải cá nhân hoá** theo tên NCC.
- Email phải có cả phần HTML và phần text thuần (plain text) để tương thích mọi trình đọc.

### FR-6: Điều tiết tốc độ & độ tin cậy khi gửi (Throttling & Reliability)
- **Giới hạn tốc độ gửi (throttle)** theo cấu hình "số mail mỗi giờ", để tránh bị nhà cung cấp email đánh dấu spam hoặc khoá tài khoản.
- **Tự thử lại (retry)** khi gửi lỗi tạm thời (tối thiểu 2 lần, có giãn thời gian giữa các lần).
- **Ghi log kết quả:** thống kê bao nhiêu mail gửi thành công, bao nhiêu lỗi, lỗi gì với email nào.

### FR-7: Xem trước trước khi gửi (Preview / Dry-run)
- Trước khi gửi thật, nhân viên phải **xem trước được**: số NCC sẽ nhận, danh sách dòng bị bỏ qua, và **một email mẫu render thật từ template**.
- Phải có nút xác nhận rõ ràng; không bao giờ gửi tự động ngay sau khi upload — luôn cần một bước người duyệt.
- Hệ thống nên hỗ trợ chế độ gửi thử tới **một email nội bộ do nhân viên nhập** (gửi 1 mail kiểm tra cho chính mình) trước khi bắn cả đợt.

### FR-8: Xử lý nền bằng hàng đợi job (Background Job Queue) — cốt lõi kỹ thuật
- Khi nhân viên bấm gửi, hệ thống **không xử lý trực tiếp trong lúc trang web đang mở**, mà tạo một "đợt gửi" (campaign) và đẩy công việc vào **hàng đợi chạy nền trên server**.
- Tiến trình chạy nền lo: chụp màn hình → render → gửi mail, tuần tự theo nhịp throttle.
- Nhân viên **đóng trình duyệt / tắt máy** thì việc gửi vẫn tiếp tục trên server.
- Hệ thống phải **chịu lỗi**: nếu server khởi động lại giữa chừng, đợt gửi có thể **tiếp tục từ chỗ dang dở** (không gửi trùng cho người đã gửi, không bỏ sót người chưa gửi).
- Hỗ trợ **tạm dừng / huỷ** một đợt đang chạy từ giao diện.

### FR-9: Lịch sử & nhật ký kiểm toán (History & Audit Log)
- Mỗi đợt gửi được **lưu lại**: ai tạo, thời điểm, số NCC, file nguồn nào, kết quả (bao nhiêu thành công / thất bại), lỗi cụ thể của từng email thất bại.
- Nhân viên xem lại được lịch sử các đợt đã gửi và **tải về báo cáo** (ví dụ danh sách email gửi lỗi để xử lý lại).
- Phục vụ minh bạch nội bộ doanh nghiệp: trả lời được câu hỏi "đợt nào, ai gửi, cho những NCC nào".

---

## 5. RÀNG BUỘC PHI CHỨC NĂNG (Non-Functional Requirements)

### NFR-1: Quy mô & hiệu năng
- Phải xử lý ổn định **>1.000 NCC** trong một đợt.
- Chụp màn hình chạy **song song có giới hạn** (cấu hình số luồng đồng thời) để cân bằng tốc độ và bộ nhớ.

### NFR-2: Khả năng gửi tới hộp thư (Deliverability) — RẤT QUAN TRỌNG
- **Cảnh báo nghiệp vụ:** Gmail miễn phí giới hạn ~500 mail/ngày, Google Workspace ~2.000 mail/ngày. Gửi >1.000 mail/ngày qua Gmail trực tiếp có nguy cơ **bị khoá tài khoản tạm thời**.
- **Khuyến nghị bắt buộc cân nhắc:** dùng dịch vụ gửi chuyên dụng (Amazon SES ~$0.1/1.000 mail, hoặc SendGrid/Resend/Mailgun) để bảo vệ uy tín tên miền và tỷ lệ vào hộp thư.
- Hệ thống phải cho phép **đổi nhà cung cấp gửi chỉ bằng cấu hình**, không phải sửa code.
- Khuyến nghị cấu hình **SPF + DKIM + DMARC** cho tên miền gửi để tránh vào hộp thư rác.

### NFR-3: Cấu hình & bảo mật
- Mọi thông tin nhạy cảm (tài khoản/mật khẩu email, khoá API) đặt trong file cấu hình môi trường (`.env`), **không hard-code, không commit lên Git**.
- Các tham số vận hành (tốc độ gửi, số luồng chụp, kích thước ảnh…) đều cấu hình được.

### NFR-4: Khả năng bảo trì
- Tách bạch các phần: giao diện (frontend) / xử lý nghiệp vụ (backend) / chụp màn hình / render / gửi mail.
- Sửa thiết kế chỉ ở template, không động vào logic.
- Có tài liệu hướng dẫn cài đặt, vận hành và sử dụng (README + hướng dẫn cho nhân viên).

### NFR-5: Tính bền vững khi chạy lại (Idempotency)
- Chạy lại / tiếp tục một đợt không được gửi trùng cho NCC đã gửi; ảnh đã chụp được tái dùng qua cache.
- Tên file/khoá đầu ra ổn định theo từng NCC (ví dụ theo email).

### NFR-6: Xác thực & phân quyền (Authentication & Authorization)
- Chỉ nhân viên được cấp tài khoản mới đăng nhập và gửi mail được.
- Nên có **phân vai trò**: nhân viên (gửi mail, xem lịch sử của mình) và quản trị (cấu hình SMTP, quản lý template, xem toàn bộ lịch sử).
- Mật khẩu lưu dạng băm (hash), không lưu thô. (Lưu ý: việc tạo tài khoản/đổi mật khẩu do người dùng tự thực hiện qua giao diện an toàn, hệ thống không lưu mật khẩu thô ở bất kỳ đâu.)

### NFR-7: Triển khai & nơi chạy (Deployment / Hosting)
- Vì là công cụ nội bộ chứa **dữ liệu NCC và thông tin đăng nhập email**, khuyến nghị deploy trên **server nội bộ công ty hoặc một VPS riêng do công ty kiểm soát**, không để mỗi máy nhân viên tự chạy bản riêng.
- Cần một nơi chạy được tiến trình nền liên tục (server bật 24/7 trong giờ gửi), một hàng đợi job, và bộ nhớ tạm cho ảnh đã chụp.
- Đóng gói bằng container (khuyến nghị Docker) để cài đặt và chuyển môi trường dễ dàng.

### NFR-8: Lưu trữ dữ liệu (Data Storage)
- Cần **cơ sở dữ liệu** lưu: tài khoản người dùng, các đợt gửi (campaign), trạng thái và kết quả từng email.
- Cần nơi lưu **file ảnh chụp** và **file upload** (ổ đĩa server hoặc object storage).
- Dữ liệu NCC từ file upload chỉ dùng cho mục đích gửi; tuân thủ quy định nội bộ về lưu trữ thông tin đối tác.

---

## 6. LUỒNG XỬ LÝ MONG MUỐN (Desired Flow)

```
NHÂN VIÊN (trình duyệt)                 SERVER (chạy nền)
─────────────────────────               ─────────────────────────────
[Đăng nhập]
     │
     ▼
[Upload file danh sách NCC] ──────────► Đọc & validate
     │                                   └─► trả về: hợp lệ / bị bỏ qua
     ▼
[Xem trước: số NCC + email mẫu]
[Gửi thử 1 mail cho chính mình] (tuỳ chọn)
     │
     ▼
[Bấm "Bắt đầu gửi"] ──────────────────► Tạo đợt gửi (campaign)
     │                                        │ đẩy vào HÀNG ĐỢI JOB
     │                                        ▼
(có thể đóng trình duyệt /            ┌─ Với mỗi NCC, tiến trình nền:
 tắt máy, vẫn chạy tiếp)              │   1. Chụp gian hàng (cache nếu có)
     │                                │   2. Render template → Email HTML + ảnh PNG
     │                                │   3. Gửi mail (throttle theo giờ, retry khi lỗi)
     │                                │   4. Ghi trạng thái từng email vào DB
     ▼                                └─ (server restart → tiếp tục từ chỗ dở)
[Theo dõi tiến trình & xem lịch sử] ◄──── Cập nhật: đã gửi / còn lại / lỗi
     │
     ▼
[Tải báo cáo: ai gửi, cho ai, X OK / Y lỗi]
```

---

## 7. DỮ LIỆU ĐẦU VÀO (Input Specification)

Nhân viên upload file **CSV hoặc Excel (.xlsx)**, mã hoá UTF-8, dòng đầu là tiêu đề cột. Thứ tự cột không quan trọng — hệ thống nhận diện theo **tên cột**:

| Cột | Bắt buộc | Mô tả | Ví dụ |
|---|---|---|---|
| `seller_name` | Nên có | Tên NCC hiển thị trong email | Công ty TNHH An Phát |
| `email` | **Bắt buộc** | Email người nhận | anphat@example.com |
| `shop_url` | **Bắt buộc** | Link gian hàng — vừa để chụp màn hình, vừa là đích của nút bấm trong email | https://shop.example.com/gian-hang/anphat |

Nên cung cấp **file mẫu tải về** ngay trên giao diện để nhân viên điền đúng định dạng.

---

## 8. TIÊU CHÍ NGHIỆM THU (Acceptance Criteria)

Hệ thống được coi là **hoàn thành đúng** khi tất cả các điều sau đều đúng:

- [ ] **AC-1:** Nhân viên (không cần kỹ thuật) đăng nhập, **upload file 1.000+ dòng**, xem trước, bấm một nút thì hệ thống tự chụp gian hàng, sinh nội dung và gửi mail cho toàn bộ NCC hợp lệ.
- [ ] **AC-2:** Mỗi email chứa **đúng tên NCC tương ứng**, ảnh chụp gian hàng của chính NCC đó, và link sản phẩm **bấm được**.
- [ ] **AC-3:** Tất cả email có thiết kế **đồng nhất** (không lệch font/bố cục), vì sinh từ một template.
- [ ] **AC-4:** Trước khi gửi, nhân viên **xem trước được email mẫu** và **gửi thử tới email của chính mình**; hệ thống không tự gửi nếu chưa bấm xác nhận.
- [ ] **AC-5:** Dòng dữ liệu thiếu email/shop_url bị **bỏ qua kèm thông báo rõ trên giao diện**, không làm hỏng cả đợt.
- [ ] **AC-6:** Có cơ chế **throttle** (số mail/giờ) và **retry** khi gửi lỗi; nhân viên xem được **báo cáo số gửi thành công / thất bại**.
- [ ] **AC-7:** Đổi nhà cung cấp gửi mail (Gmail → SES…) chỉ cần sửa **cấu hình**, không sửa code.
- [ ] **AC-8:** Sau khi bấm gửi, nhân viên **đóng trình duyệt / tắt máy** mà việc gửi **vẫn tiếp tục trên server**; quay lại vẫn xem được tiến trình.
- [ ] **AC-9:** Nếu server khởi động lại giữa đợt, việc gửi **tiếp tục từ chỗ dở**, không gửi trùng, không bỏ sót.
- [ ] **AC-10:** Mọi đợt gửi được **lưu lịch sử** (ai, khi nào, cho bao nhiêu NCC, kết quả) và **tải báo cáo** được.
- [ ] **AC-11:** Có **đăng nhập**; chỉ tài khoản được cấp mới gửi được. Mật khẩu lưu dạng băm.
- [ ] **AC-12:** Chạy lại / chụp lại **không chụp lại** ảnh đã có (cache hoạt động).
- [ ] **AC-13:** Không có thông tin nhạy cảm (mật khẩu, khoá API) bị hard-code trong mã nguồn.
- [ ] **AC-14:** Có README hướng dẫn cài đặt + triển khai, và hướng dẫn ngắn cho nhân viên sử dụng.

---

## 9. RỦI RO & LƯU Ý NGHIỆP VỤ (Risks & Notes)

| Rủi ro | Ảnh hưởng | Giảm thiểu |
|---|---|---|
| Gửi quá nhiều mail/ngày qua Gmail | Bị khoá tài khoản | Dùng SES/SendGrid; chia batch; throttle |
| Email vào hộp thư rác | NCC không thấy | Cấu hình SPF/DKIM/DMARC; nội dung sạch |
| Trang gian hàng tải chậm/timeout | Thiếu ảnh vài NCC | Tăng timeout; ghi log NCC lỗi để chụp lại |
| Nhiều NCC trùng một gian hàng | Chụp dư thừa | Cache theo URL (tối ưu mở rộng) |
| Sai dữ liệu trong file upload | Gửi nhầm người | Validate khi upload + bắt buộc xem trước/gửi thử |
| Server tắt giữa đợt gửi | Gửi dở dang / trùng | Hàng đợi job bền vững, tiếp tục từ chỗ dở |
| Nhân viên bấm gửi nhiều lần | Gửi trùng cho NCC | Khoá đợt đang chạy; đánh dấu email đã gửi |
| Lộ thông tin NCC / SMTP | Rủi ro bảo mật | Deploy nội bộ; phân quyền; không hard-code bí mật |
| Nhân viên thao tác sai | Gửi nhầm đợt | Giao diện đơn giản, bước xác nhận, thông báo dễ hiểu |

---

## 10. GỢI Ý KỸ THUẬT (Implementation Hints — không bắt buộc)

> Phần này chỉ gợi ý; người/agent thực thi có thể chọn công nghệ phù hợp miễn là đáp ứng mục 4–9. Stack dưới đây chọn theo hướng quen thuộc, dễ tuyển người và phù hợp xử lý web + nền + ảnh trong một hệ sinh thái.

**Kiến trúc tổng thể:** ứng dụng web hai lớp — **Frontend** (giao diện sale) + **Backend** (API + tiến trình nền), kèm **hàng đợi job** và **cơ sở dữ liệu**.

- **Frontend:** Next.js / React — màn hình upload (kéo-thả), trang xem trước email mẫu, trang theo dõi tiến trình (cập nhật real-time qua polling hoặc WebSocket), trang lịch sử & tải báo cáo.
- **Backend:** Node.js, gợi ý NestJS — REST API nhận file upload, validate, tạo campaign, đưa job vào hàng đợi, cung cấp trạng thái/lịch sử.
- **Hàng đợi job chạy nền:** **BullMQ + Redis** — mỗi NCC (hoặc mỗi lô nhỏ) là một job; BullMQ lo retry, tạm dừng, tiếp tục sau khi restart, và **điều tiết nhịp gửi (rate limit)** để giữ đúng throttle. Đây là thành phần đáp ứng FR-8.
- **Chụp màn hình:** Playwright (headless browser) chạy trong worker — render web hiện đại chuẩn, chụp @2x.
- **Template & render:** HTML/CSS với engine biến (ví dụ Handlebars). HTML vừa làm thân email, vừa render ra PNG bằng chính Playwright → đảm bảo (a) email và (b) ảnh không lệch.
- **Gửi mail:** **Nodemailer** (thư viện SMTP tiêu chuẩn của Node.js). *Lưu ý quan trọng:* Nodemailer chỉ là ống dẫn SMTP, **không tự throttle**; việc điều tiết tốc độ phải do BullMQ đảm nhận. Cấu hình host/port để đổi nhà cung cấp (Gmail → Amazon SES / SendGrid) chỉ bằng biến môi trường.
- **Cơ sở dữ liệu:** PostgreSQL (hoặc tương đương) — lưu user, campaign, trạng thái từng email. Redis cho hàng đợi.
- **Lưu file:** ổ đĩa server hoặc object storage (ví dụ S3/R2) cho ảnh chụp và file upload.
- **Xác thực:** cơ chế đăng nhập có session/token, mật khẩu băm (ví dụ bcrypt/argon2).
- **Triển khai:** đóng gói Docker; deploy trên server nội bộ hoặc VPS công ty (xem NFR-7).
- **Cấu hình & bí mật:** đọc từ biến môi trường (`.env` / secret manager), không commit.

> **Lưu ý tái sử dụng:** phần lõi xử lý (chụp bằng Playwright, render template HTML→PNG, gửi bằng Nodemailer, throttle/retry) về bản chất giống một script pipeline; khi lên web app chỉ cần **bọc các bước này thành job trong worker** thay vì chạy tuần tự bằng dòng lệnh. Logic nghiệp vụ không đổi.

---

## 11. LỘ TRÌNH GỢI Ý (Phasing — không bắt buộc)

Để giảm rủi ro, có thể chia làm các giai đoạn:

1. **Giai đoạn 1 — Lõi gửi (engine):** pipeline chụp → render → gửi + throttle/retry, chạy được với một file mẫu. Xác nhận email/ảnh đúng, không bị spam.
2. **Giai đoạn 2 — Nền hoá:** đưa lõi vào BullMQ + Redis; chạy nền, tiếp tục sau restart; lưu trạng thái vào DB.
3. **Giai đoạn 3 — Giao diện sale:** Next.js upload + xem trước + gửi thử + theo dõi tiến trình + lịch sử.
4. **Giai đoạn 4 — Hoàn thiện vận hành:** đăng nhập/phân quyền, quản lý template & cấu hình SMTP qua giao diện, đóng gói Docker, tài liệu.

---

*Hết tài liệu. Mọi yêu cầu bổ sung hoặc thay đổi phạm vi cần được cập nhật vào mục 3 (Mục tiêu) và mục 8 (Tiêu chí nghiệm thu) để giữ tài liệu là nguồn sự thật duy nhất.*
