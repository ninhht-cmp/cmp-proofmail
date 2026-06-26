# experimental/ — Tầng B (ESP delivery events)

> **Trạng thái: chưa nằm trong luồng CLI đang chạy.** Code ở đây hoạt động và có
> test, nhưng KHÔNG được luồng gửi Gmail-SMTP hiện tại gọi tới. Tách ra đây để
> phần lõi (`src/`) chỉ chứa thứ thực sự chạy mỗi ngày — giảm bề mặt phải đọc,
> bảo trì và bảo mật.

## Có gì ở đây

| File | Vai trò |
|---|---|
| `delivery-events.js` | Chuẩn hoá payload bounce/complaint của ESP (SES, SendGrid) → một shape chung; đẩy hard-bounce/complaint vào suppression list. |
| `ingest-events.js`   | Nạp sự kiện ESP từ file JSON (batch/feedback import). |
| `webhook-server.js`  | HTTP receiver nhận sự kiện ESP realtime — **bản STARTER**, chưa verify chữ ký provider. |

## Khi nào dùng

Chỉ cần khi chuyển từ Gmail-SMTP sang **dịch vụ gửi chuyên dụng** (Amazon SES /
SendGrid) — xem khuyến nghị deliverability trong `README.md` và `BUSINESS-REQUIREMENT.md`.
Lúc đó tầng này cho phép tự động hoá: ESP báo địa chỉ chết → tool không gửi lại.

Phần **suppression list** (chống gửi lại địa chỉ đã bị từ chối) thì vẫn chạy trong
lõi: `src/core/mailer/campaign-sender.js` tự thêm địa chỉ bị SMTP từ chối vĩnh viễn
(5xx) vào danh sách. Tầng B ở đây chỉ bổ sung nguồn sự kiện *bất đồng bộ* từ ESP.

## Chạy

```bash
npm run test:experimental                                   # test riêng tầng này

node experimental/ingest-events.js --file=events.json --provider=ses
WEBHOOK_PROVIDER=sendgrid WEBHOOK_SECRET=... node experimental/webhook-server.js
```

Cấu hình webhook (chỉ khi chạy `webhook-server.js`):

```
WEBHOOK_PORT=8080
WEBHOOK_PROVIDER=normalized   # ses | sendgrid | normalized
WEBHOOK_SECRET=               # đặt → caller phải gửi "Authorization: Bearer <secret>"
```

> Trước khi expose webhook ra Internet: verify chữ ký provider (SNS / SendGrid
> signed webhook), xử lý SNS SubscriptionConfirmation, đặt sau HTTPS.
