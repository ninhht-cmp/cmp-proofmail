# 📧 Proofmail

> Gửi bằng chứng gian hàng tới nhà cung cấp.

Tự động chụp ảnh gian hàng → ghép vào mẫu thiết kế → gửi email cá nhân hoá cho từng nhà cung cấp. Một mẫu duy nhất sinh ra **email HTML** (link bấm được) **và** bản **plain-text** đi kèm từ cùng một nguồn, nên hai phần không bao giờ lệch nhau. Ảnh gian hàng được **nhúng trực tiếp** trong email (inline, không phải file đính kèm rời).

---

## 🟢 DÀNH CHO NGƯỜI DÙNG (nhân viên sale)

### Cài 1 lần

1. Cài **Node.js** bản LTS: https://nodejs.org (bấm Next đến hết).
2. Mở thư mục tool, copy file `.env.example` thành `.env`, mở bằng Notepad và điền email + mật khẩu gửi. **Hướng dẫn điền chi tiết: [`HUONG-DAN-CAU-HINH-ENV.md`](HUONG-DAN-CAU-HINH-ENV.md).**

### Mỗi lần gửi — chỉ 3 bước

1. Bỏ file danh sách (`.csv` hoặc `.xlsx`) vào thư mục **`data/`**. Xem file `data/sample-sellers.csv` để biết cần những cột gì.
2. **Bấm đúp** vào:
   - `start.bat` nếu dùng **Windows**
   - `start.sh` nếu dùng **Mac/Linux**
3. Làm theo hướng dẫn hiện trên màn hình: chọn file → xem thử → gõ `GUI` để gửi.

> Tool sẽ **tự gửi thử 1 mail cho bạn xem trước**, và **hỏi xác nhận** trước khi gửi thật. Gửi nhầm là điều gần như không thể xảy ra.

> Lỡ tắt giữa chừng? Cứ chạy lại — tool **tự bỏ qua** những NCC đã gửi, không gửi trùng.

---

## ⚙️ DÀNH CHO DEV

> **Package manager:** dùng **npm** (đã khoá trong `package.json` qua `packageManager`). Tool cài đúng một lần trên máy mỗi nhân viên qua launcher, nên npm — có sẵn cùng Node.js, không cần cài thêm — là lựa chọn ít ma sát nhất và đảm bảo máy dev với máy người dùng cài cùng phiên bản (một lockfile duy nhất `package-lock.json`). Đừng trộn pnpm/yarn để tránh lệch lockfile.

### Chạy

```bash
npm install
npx playwright install chromium
cp .env.example .env     # điền cấu hình (xem HUONG-DAN-CAU-HINH-ENV.md)

npm start                # build (tsc) rồi mở wizard hỏi-đáp (mặc định)
```

Mặc định: **gửi thủ công từng người bán** — chọn nguồn, lọc/chọn từng người, gửi.
`--auto` chạy chế độ gửi cả đợt (bulk) như cũ.

### TypeScript & build

Mã nguồn là **TypeScript** trong `src/`. `tsc` biên dịch ra `dist/` (gitignore),
và **`node` chạy `dist/`** — KHÔNG dùng ts-node/tsx, KHÔNG tải binary nào.

```bash
npm run build         # tsc: typecheck + emit dist/  (incremental → lần sau rất nhanh)
npm run typecheck     # tsc --noEmit (chỉ kiểm, không emit)
npm run format        # Prettier (ghi); format:check để chỉ kiểm
npm test              # pretest tự build, rồi chạy test trên dist/
```

- **Chạy = build rồi node dist.** Launcher (`start.*`) tự `npm run build` (incremental,
  gần như tức thì khi nguồn không đổi) rồi `node dist/cli/main.js`. Lỗi kiểu = build
  fail = tool báo rõ thay vì chạy sai. Type là contract được máy ép đúng — `src/core/types.js`
  là single source cho `Seller`/`Config`/`CampaignResult`…
- **Tách dev/runtime deps.** Launcher người dùng cài `npm install --omit=dev`. `typescript`
  là **dependency** (pure-JS, không tải binary) nên build được trên máy nhân viên; chỉ
  `prettier` là devDependency. CI/dev cài đầy đủ qua `npm ci`.
  CI gate: **build (tsc) → format:check → test → test:experimental**.

**Chọn chế độ nào?**

| | Thủ công (mặc định) | Cả đợt (`--auto`) |
|---|---|---|
| Hợp với | đợt nhỏ, chăm sóc có chọn lọc, cần kiểm soát từng mail | chiến dịch lớn (hàng trăm–nghìn NCC) |
| Tốc độ | theo nhịp người (không throttle) | tự throttle `MAILS_PER_HOUR`, chạy hàng giờ |
| Xem trước | **xem trước email thật trong trình duyệt** trước mỗi lần gửi | gửi thử 1 mail cho chính mình + gõ `GUI` xác nhận |
| Rủi ro khoá tài khoản | thấp (gửi rải) | cao nếu vượt hạn mức Gmail → cân nhắc ESP (xem mục dưới) |
| Đổi mẫu giữa chừng | có (`↻ Đổi mẫu mail`) | chọn 1 mẫu cho cả đợt |

> Gửi >500/ngày qua Gmail dễ bị khoá — đợt lớn nên dùng `--auto` **cùng** ESP (SES/SendGrid), không phải Gmail.

**Chế độ điền nháp Outlook** (`--draft`, hoặc `MAIL_TRANSPORT=outlook-draft` trong `.env`):
KHÔNG gửi qua SMTP. Chọn từng người → tool chụp gian hàng + dựng mail → **mở sẵn
nháp** (subject + nội dung + ảnh) ngay trong app **Outlook "Classic"** trên Windows;
bạn xem lại rồi **bấm Gửi tay**. Chỉ đánh dấu "đã gửi" sau khi bạn xác nhận đã gửi.
Chỉ chạy trên Windows + Outlook Classic (New Outlook / Outlook web không hỗ trợ);
ở chế độ này không cần `SMTP_HOST/PASS`, chỉ cần `MAIL_FROM_EMAIL`.

### Chế độ cờ lệnh (bỏ qua wizard, để tự động hoá)

```bash
npm run build   # 1 lần (hoặc dùng `npm start -- <cờ>` để tự build trước)
node dist/cli/main.js --sheet="<link Google Sheets>"      # đọc danh sách từ Google Sheet
node dist/cli/main.js --file=data/sellers.xlsx            # gửi thủ công từ file
node dist/cli/main.js --draft --file=data/sellers.xlsx    # điền nháp vào Outlook, gửi tay (Windows)
node dist/cli/main.js --auto --file=data/sellers.csv --yes # gửi cả đợt, không hỏi (cẩn thận!)
npm run screenshot                                       # chỉ chụp gian hàng
```

> Tầng B (nạp bounce/complaint của ESP, webhook) đã chuyển sang `experimental/` —
> chưa thuộc luồng gửi hiện tại. Xem `experimental/README.md`.

Các cờ: `--file=` chọn file; `--sheet=` link Google Sheet; `--auto` gửi cả đợt;
`--draft` điền nháp vào Outlook để gửi tay (Windows + Outlook Classic);
`--dry` chạy thử (chỉ với `--auto`); `--yes` bỏ câu hỏi xác nhận.

### Cấu trúc

Kiến trúc **ports & adapters**: `core/` là lõi nghiệp vụ thuần (không terminal,
không config toàn cục); `adapters/` nói chuyện với thế giới ngoài (SMTP, trình
duyệt, ổ đĩa); `cli/` chỉ là một interface bọc quanh core. V2 web chỉ cần thêm
`server/` ghép tuần tự `core/capture → render → mailer` (đã tách sạch, config
inject qua tham số), **không sửa core**.

```
start.bat / start.sh                ← người dùng bấm đúp vào đây (chạy bản đang ghim)
update.bat / update.sh              ← cập nhật lên release mới (có test + tự rollback nếu lỗi)
rollback.bat / rollback.sh          ← quay về bản liền trước nếu bản mới có vấn đề
data/                               ← bỏ file danh sách NCC vào đây
templates/touch.hbs                 ← MẪU THIẾT KẾ HTML mặc định (1 nguồn cho cả email lẫn ảnh)
templates/touch.txt.hbs             ← bản plain-text đi kèm (cùng dữ liệu, không lệch)
templates/followup.hbs              ← mẫu nhắc lại (gửi sau 'touch' cho cùng người)
templates/followup.subject.hbs      ← tiêu đề riêng cho mẫu followup (tùy chọn; không có → dùng MAIL_SUBJECT)
                                      Thêm mẫu: thả templates/<tên>.hbs (+ .txt.hbs, + .subject.hbs tùy chọn);
                                      chọn mẫu ngay trên CLI (hoặc MAIL_TEMPLATE=<tên> làm mặc định / --template <tên>)
.env                                ← cấu hình SMTP (KHÔNG commit)

scripts/                            ← lệnh dev (KHÔNG thuộc CLI người dùng)
└── screenshot.js                   ← chỉ chụp gian hàng (npm run screenshot)

experimental/                       ← Tầng B (ESP bounce/complaint) — CHƯA dùng trong luồng hiện tại
├── delivery-events.js              ← chuẩn hoá sự kiện ESP (SES/SendGrid) → suppression
├── ingest-events.js                ← nạp sự kiện ESP từ file JSON
└── webhook-server.js               ← receiver webhook (starter) — xem experimental/README.md

tsconfig.json                       ← cấu hình tsc (strict, emit src/ → dist/, incremental)
src/                                ← MÃ NGUỒN TypeScript (.ts) — nơi sửa code
├── cli/                            ← interface terminal (bọc quanh core)
│   ├── main.ts                     ← điểm vào: chọn nguồn → manual (mặc định) / --auto
│   ├── manual-flow.ts              ← gửi thủ công từng người bán (chọn → chụp → xem trước → gửi)
│   ├── manual-draft-flow.ts        ← luồng điền nháp Outlook (Windows)
│   ├── capture-step.ts             ← phiên trình duyệt lazy + spinner (dùng chung 2 luồng manual)
│   ├── seller-picker.ts            ← chọn/lọc người bán (dùng chung)
│   ├── template-picker.ts          ← chọn mẫu mail + campaignIdFor
│   ├── email-preview.ts            ← render email thật ra HTML tạm + mở trình duyệt (xem trước)
│   ├── args.ts                     ← parse cờ lệnh (--file=, --sheet=, --auto…) dùng chung
│   └── ui.ts                       ← palette cam + banner + progress bar (ETA) + panel kết quả
├── core/                           ← lõi nghiệp vụ thuần (không terminal, không config toàn cục)
│   ├── types.ts                    ← ĐỊNH NGHĨA KIỂU domain (Seller/Config/CampaignResult…) — 1 nguồn
│   ├── sellers/
│   │   ├── seller-loader.ts        ← đọc CSV/XLSX → mảng dòng (chịu header trống/trùng)
│   │   └── seller-validator.ts     ← validate, loại trùng, sinh slug (hàm thuần)
│   ├── capture/
│   │   └── store-capturer.ts       ← chụp gian hàng (Playwright, song song / theo từng người, có cache)
│   ├── render/
│   │   └── template.ts             ← Handlebars: build HTML + plain-text + subject (cache compile)
│   └── mailer/
│       └── campaign-sender.ts      ← gửi mail (throttle, retry, checkpoint, headers chống spam)
├── adapters/                       ← rìa I/O (cô lập thư viện ngoài)
│   ├── browser.ts                  ← khởi tạo Chromium
│   ├── smtp-transport.ts           ← khởi tạo nodemailer
│   ├── google-sheet.ts             ← đọc Google Sheet qua CSV export (chỉ đọc)
│   ├── imap-sent.ts                ← lưu bản sao vào hộp "Đã gửi" qua IMAP (best-effort)
│   ├── outlook-draft.ts (+ .ps1)   ← mở nháp trong Outlook Classic (Windows; .ps1 là asset nguồn)
│   └── storage.ts                  ← gom mọi đường dẫn + đọc/ghi file 1 chỗ (ghi atomic)
├── config/
│   ├── app-config.ts               ← đọc .env → object cấu hình (hàm hoá, không singleton)
│   └── env-check.ts                ← kiểm tra cấu hình còn thiếu
└── lib/                            ← util thuần, không domain (dùng được mọi tầng)
    ├── util.ts                     ← sleep(...), errMsg(...)
    └── patterns.ts                 ← EMAIL_RE (1 nguồn cho validator + CLI)

dist/                               ← KẾT QUẢ build (tsc) — node chạy ở đây; gitignore, KHÔNG sửa tay
test/                               ← unit test (.js, import từ dist/) — npm test (tự build trước)
output/artifacts/                   ← ảnh chụp: shot_*.jpg (xoá được, tự tạo lại)
output/state/campaign-<id>.json     ← tiến độ gửi THEO campaign (id từ tên nguồn; V2 → DB)
output/state/suppression.json       ← danh sách do-not-send (bounce/complaint) toàn cục
output/reports/report-<id>.csv      ← báo cáo gửi (Name/Email/Shop URL/Status/Created At…)
```

### Tính năng pro

- **Wizard hỏi-đáp** tiếng Việt cho người không-kỹ-thuật; **cờ lệnh** cho dev.
- Đọc cả **CSV và Excel (.xlsx)**; nhận diện cột bất kể hoa/thường/khoảng trắng.
- **Validate** ngay khi đọc: bỏ dòng thiếu/ sai email, loại trùng, báo rõ lý do.
- **Xem trước email thật** trong trình duyệt (thủ công) · **gửi thử** 1 mail + bắt gõ `GUI` (cả đợt).
- **Throttle** theo `MAILS_PER_HOUR` + **retry** 2 lần khi lỗi (chế độ cả đợt).
- **Checkpoint**: chạy lại không gửi trùng; an toàn khi tắt giữa chừng.
- **Thanh tiến trình có ETA** ("~2.1 giờ còn lại") + panel kết quả gọn.

---

## ⚠️ Gửi >1000 mail — đọc kỹ

- Gmail giới hạn ~500 mail/ngày (Workspace ~2000). Vượt ngưỡng dễ **bị khoá tài khoản**.
- Khuyến nghị đổi sang **Amazon SES** (~$0.1/1000 mail) / SendGrid / Resend — chỉ cần sửa 4 dòng `SMTP_*` trong `.env`, không đụng code.
- Cấu hình **SPF + DKIM + DMARC** cho tên miền để không vào hộp thư rác.

---

## 🖥️ ĐÓNG GÓI & CHẠY ĐA NỀN TẢNG (Windows 10/11 · macOS · Linux)

Tool **ship mã nguồn** (không ship sẵn thư viện/trình duyệt), launcher tự cài trên
máy người dùng. Vì mọi thư viện đều JS thuần, **một file zip dùng chung cho cả 3
hệ điều hành** — không cần build riêng.

### Cài đặt (nhân viên, một lệnh)

Repo để **public** nên không cần đăng nhập gì. Người dùng dán đúng một lệnh:

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/ninhht-cmp/proofmail/main/install.ps1 | iex
```
```bash
# macOS / Linux (Terminal)
curl -fsSL https://raw.githubusercontent.com/ninhht-cmp/proofmail/main/install.sh | bash
```

Installer `git clone` repo về `~/proofmail` (giữ `.git` → cập nhật được về sau)
rồi chạy launcher để cài thư viện + tạo `.env`. Vì clone giữ nguyên file đã
track theo `.gitattributes`, **EOL luôn đúng** (`start.bat`=CRLF, `start.sh`=LF) và
**không bao giờ lọt** `.env`/`node_modules`/dữ liệu NCC thật (đều không được track).
Yêu cầu duy nhất trên máy người dùng: **Git** (để clone + cập nhật).

### Launcher tự lo gì (khi người dùng bấm đúp)

1. Kiểm tra **Node.js ≥ 20** (báo rõ nếu thiếu/cũ).
2. `npm install` + tải **Chromium**. Nếu tải Chromium lỗi (proxy/mạng) → **không
   chặn**: tool tự dùng **Microsoft Edge** (có sẵn mọi máy Win10/11) hoặc **Google
   Chrome**. Cùng nhân Chromium nên ảnh chụp y hệt.
3. Tạo `.env` từ mẫu nếu chưa có, dừng để điền SMTP.

### Lưu ý theo hệ điều hành

| OS | Cần biết | Cách xử lý |
|---|---|---|
| **Windows 10/11** | Mở `.bat` tải từ mạng → SmartScreen cảnh báo | Bấm **"More info" → "Run anyway"** (1 lần). Có sẵn Edge nên không lo tải Chromium. |
| **macOS** | Gatekeeper chặn `.command` tải từ mạng ("unidentified developer") | **Chuột phải → Open** (lần đầu), bấm Open. Hoặc Terminal: `xattr -dr com.apple.quarantine <thư-mục-tool>` |
| **macOS/Linux** | `.sh`/`.command` báo "permission denied" (hiếm — `git clone` thường giữ quyền chạy) | `chmod +x start.sh start.command` |
| **Linux** | Không có Edge/Chrome + Chromium thiếu thư viện hệ thống | `npx playwright install --with-deps chromium` (cần sudo), hoặc cài Google Chrome |

### Khắc phục sự cố thường gặp

| Triệu chứng | Nguyên nhân | Cách sửa |
|---|---|---|
| "Chua cai Node.js" / "quá cũ" | Chưa cài hoặc Node < 20 | Cài bản **LTS** tại nodejs.org; mở **cửa sổ mới** (PATH cập nhật) |
| Treo lâu ở bước tải Chromium | Proxy/firewall chặn CDN | Cứ chờ — khi lỗi tool vẫn chạy bằng Edge/Chrome. Hoặc cài Chrome trước. |
| "Không mở được trình duyệt để chụp" | Không có Chromium **lẫn** Edge/Chrome | Cài Google Chrome, hoặc `npx playwright install chromium` |
| Banner hiện ô vuông lạ trên cmd cũ | Font cmd.exe không có ký tự đặc biệt | Cosmetic — dùng Windows Terminal, không ảnh hưởng chức năng |
| Gửi mail báo lỗi đăng nhập | Sai/thiếu App Password | Gmail/365 phải dùng **App Password**; tool tự bỏ khoảng trắng khi dán |

---

## 🔒 PHÂN PHỐI & TRIỂN KHAI NỘI BỘ (dành cho người quản lý tool)

Đây là phần mềm **chỉ dùng nội bộ** (xem `LICENSE.txt`). Khuyến nghị triển khai theo 3 lớp:

### Lớp 1 — Truy cập & ranh giới bí mật

- Repo để **public** để nhân viên cài bằng một lệnh, không phải quản lý lời mời/đăng nhập.
- **Hệ quả phải hiểu rõ:** ai có URL đều đọc được **mã nguồn**. Điều này chấp nhận
  được vì logic ở đây không phải bí mật thương mại, và mã vốn đã đọc được trên máy
  người dùng dù đóng gói kiểu gì (xem ghi chú cuối mục).
- Cái thật sự cần bảo vệ — **credential SMTP + danh sách NCC** — **không** nằm trong
  repo (xem Lớp 2). Public repo không làm lộ chúng.
- Nếu sau này cần che mã nguồn thật sự: chuyển sang **V2 (web app)** chạy trên server
  của bạn (xem `experimental/`), chứ không phải private repo + zip.

### Lớp 2 — Bảo vệ bí mật (đã có sẵn)

- File `.env` (chứa mật khẩu SMTP) **không bao giờ** được commit — `.gitignore` đảm bảo điều này, nên `git clone` không bao giờ kéo nó về máy người dùng.
- **Không hardcode** mật khẩu trong code. Mỗi nhân viên/phòng tự điền `.env` riêng của mình.
- Dữ liệu NCC thật trong `data/` cũng không bị đóng gói (chỉ giữ file mẫu).

### Lớp 3 — Phân phối & cập nhật (theo **release tag**, có rollback)

Tool **không tự `git pull`** mỗi lần chạy nữa. Mỗi máy **ghim vào một bản phát hành**
(git tag `vX.Y.Z`) đã được test; cập nhật là thao tác **chủ động, có kiểm tra, tự lùi
được**. Lý do: lỡ bản mới lỗi thì bản đang chạy-OK không bị kéo theo.

**Vận hành trên máy nhân viên:**

1. Cài **Git** một lần + dán lệnh installer (mục "Cài đặt" ở trên) → `git clone` về `~/proofmail`.
2. **Bấm `start`** như thường — chạy đúng bản đang ghim. Nếu có release mới, launcher
   **chỉ báo một dòng** "Có bản mới vX.Y.Z" rồi vẫn chạy bản cũ (không tự đổi gì).
3. Muốn lên bản mới: **bấm `update`** (`update.sh`/`update.bat`). Nó: nhớ bản hiện tại →
   checkout tag mới nhất → `npm install` → **chạy `npm test`**. Test **lỗi → tự quay về
   bản cũ ngay**. Đạt → dùng bản mới.
4. Bản mới qua test nhưng thực tế vẫn có vấn đề: **bấm `rollback`** (`rollback.sh`/`.bat`)
   → quay về bản liền trước (lưu trong `.proofmail-prev-version`). Hoặc về bản bất kỳ:
   `git checkout v1.0.0 && npm install`.

**Phía người quản lý tool (phát hành một bản):**

```bash
# 1) Đảm bảo test xanh
npm test
# 2) Bump version trong package.json (semver: feature → minor, sửa lỗi → patch)
# 3) Commit rồi gắn thẻ KHỚP version và push cả thẻ
git commit -am "release: v1.1.0"
git tag v1.1.0
git push && git push --tags
```

Chỉ những commit **được gắn thẻ `v*`** mới tới tay nhân viên (qua `update`). Commit chưa
gắn thẻ trên `main` không tự về máy ai → bạn push WIP thoải mái mà không ảnh hưởng sản xuất.
Version đang chạy hiện ngay trên **banner** (`✻ PROOFMAIL  vX.Y.Z`) để biết máy nào ở bản nào.

> **Lưu ý thẳng thắn về "bảo vệ code":** vì tool chạy trên máy nhân viên, **không thể** ngăn tuyệt đối việc đọc code (đóng gói .exe cũng trích xuất được, và Playwright/Chromium rất khó đóng gói kiểu đó). Điều này **không đáng lo**: logic ở đây không phải bí mật thương mại. Cái thật sự cần bảo vệ là **credential SMTP + danh sách NCC**, và chúng được bảo vệ bằng Lớp 1 & 2 ở trên.
>
> **Khi nào cần bảo vệ tuyệt đối?** Khi đó hãy chuyển sang kiến trúc **web app nội bộ** (xem `BUSINESS-REQUIREMENT.md`): code chạy trên server công ty, nhân viên chỉ truy cập qua trình duyệt + đăng nhập, không bao giờ thấy code hay giữ credential. Phần lõi hiện tại tái dùng được nguyên vẹn.
