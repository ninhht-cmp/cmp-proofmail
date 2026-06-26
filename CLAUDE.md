# CLAUDE.md — quy ước dự án Proofmail

Hướng dẫn cho người (và AI agent) sửa code. Mục tiêu: giữ codebase nhất quán,
mượt, không tái phát các lỗi đã từng gặp.

## Ngôn ngữ nghiệp vụ (ubiquitous language) — QUAN TRỌNG

Một khái niệm = **một từ trong code**. Người nhận mail được gọi là **`seller`**.

| Ngữ cảnh | Dùng từ |
|---|---|
| Code / biến / hàm / file / cột dữ liệu / biến template | **`seller`**, `seller_name` |
| Tài liệu nghiệp vụ tiếng Việt (BUSINESS-REQUIREMENT, README cho user) | "nhà cung cấp" / "NCC" — **là cùng khái niệm `seller`** |

⛔ **Không** dùng `supplier`, `supplier_name`, `ncc`, `vendor` trong code/template/env.
Đây không phải chuyện thẩm mỹ: một tiêu đề mail `{{supplier_name}}` từng render
TRỐNG vì renderer chỉ cấp `seller_name` → mọi mail gửi đi thiếu tên người nhận.

Biến template được phép, theo từng phần:
- **Subject**: mặc định lấy từ `MAIL_SUBJECT` (.env); có thể đặt riêng theo từng
  mẫu bằng file `templates/<tên>.subject.hbs` (có thì override, không thì dùng
  `MAIL_SUBJECT`) — xem `subjectTemplateFor`. Dù nguồn nào cũng chỉ dùng được
  `{{seller_name}}`, `{{from_name}}`. Nguồn sự thật biến: `SUBJECT_VARS` trong
  `src/core/render/template.ts`. Sai tên biến → CLI cảnh báo lúc khởi động
  (`unknownSubjectVars`, kiểm trên subject HIỆU LỰC của mẫu đang chọn).
- **HTML** (`templates/*.hbs`): `{{seller_name}}`, `{{shop_url}}`, `{{shop_image_src}}`, `{{assets.*}}`.
- **Text** (`templates/*.txt.hbs`): `{{seller_name}}`, `{{shop_url}}`, `{{from_name}}`, `{{contact}}`.

## Kiến trúc — ports & adapters

```
cli/      → interface (terminal). KHÔNG đặt logic nghiệp vụ ở đây.
core/     → lõi thuần: không terminal, không đọc env trực tiếp, không global.
            Nhận config + store qua THAM SỐ (dependency injection).
adapters/ → rìa I/O: nodemailer, Playwright, fs, Google Sheet. Cô lập thư viện ngoài.
config/   → đọc .env → object config (loadConfig là factory, không singleton).
lib/      → util thuần, không domain.
```

Quy tắc vàng: **core không được import từ `cli/`**, không đọc `process.env`, không
`console.log`. Tiến trình báo ra ngoài qua callback `onProgress`. Nhờ vậy V2 (web)
bọc lại core thành job mà không sửa lõi.

## TypeScript & build (QUAN TRỌNG)
- Mã nguồn là **TypeScript** trong `src/` (`.ts`). `tsc` biên dịch ra `dist/`
  (gitignore); **`node` luôn chạy `dist/`**, KHÔNG ts-node/tsx, KHÔNG transpile lúc chạy.
- Import specifier giữ đuôi **`.js`** ngay cả trong file `.ts` (NodeNext) — tsc tự
  resolve sang `.ts` và emit `.js`. Đừng đổi sang `.ts` trong import.
- `tsconfig.json`: `strict` BẬT nhưng `noImplicitAny` TẮT (gradual: tham số chưa chú
  thích = `any`; cái đã chú thích bị kiểm chặt). `noUnusedLocals` bắt import thừa.
- Kiểu domain dùng chung ở **`src/core/types.ts`** (`Seller`/`Config`/`CampaignResult`…)
  — thêm/sửa shape ở ĐÂY, không rải khắp nơi.
- `typescript` + `@types/*` là **dependencies** (build chạy trên máy người dùng);
  chỉ `prettier` là devDependency. Lint = `tsc` + Prettier (KHÔNG dùng ESLint).
- Launcher tự `npm run build` (incremental) rồi chạy `dist/`. Lỗi kiểu = build fail
  = tool báo rõ, KHÔNG chạy sai.

## Quy ước đặt tên
- File/folder: **kebab-case** (`campaign-sender.ts`, `seller-validator.ts`).
- Hàm: động từ rõ nghĩa (`captureStores`, `recordSent`, `loadSheetToFile`).
- Thông báo cho người dùng cuối: **tiếng Việt, ngôn ngữ đời thường**, không mã lỗi kỹ thuật.

## Cấu hình & bí mật
- Mọi giá trị vận hành đọc từ `.env` (xem `.env.example` — nguồn sự thật để copy).
- **Không** hardcode credential. `.env` không commit (`.gitignore`) → không vào bản phân phối (cài qua `git clone`, file chưa track không bao giờ theo về).
- Thêm config mới: khai báo trong `loadConfig` (kèm default an toàn) + ghi vào `.env.example`.

## Deliverability (đang dùng Gmail-SMTP)
- Mỗi mail có header `List-Unsubscribe` tự sinh từ `MAIL_FROM_EMAIL` (mailto) để
  người nhận opt-out thay vì báo spam. One-click https + xử lý tự động là việc của
  ESP/V2 (xem `experimental/`).
- Cảnh báo nghiệp vụ: gửi >500/ngày qua Gmail dễ bị khoá. Gửi lớn → đổi sang
  Amazon SES/SendGrid (chỉ sửa `SMTP_*` trong .env) + cấu hình SPF/DKIM/DMARC cho
  `comacpro.net`, và bật lại Tầng B trong `experimental/`.

## `experimental/`
Code Tầng B (ESP bounce/complaint: webhook + ingest + normalizer) đã tách khỏi
lõi vì CHƯA nằm trong luồng gửi hiện tại. Đừng để `src/` import từ `experimental/`.
Khi chuyển sang ESP thật thì kéo vào lõi. Xem `experimental/README.md`.

## Test
- `npm test` — `pretest` tự `npm run build`, rồi chạy test lõi (`test/*.test.js`,
  import từ `dist/`). Phải xanh trước khi commit.
- `npm run test:experimental` — test Tầng B (cũng tự build trước).
- Sửa hành vi → cập nhật / thêm test tương ứng (đặc biệt: store, validator, render, suppression).

## Package manager
Dùng **npm** (đã khoá qua `packageManager` trong package.json). Commit `package-lock.json`.
Không trộn pnpm/yarn.

## Phát hành & version

Đơn vị phát hành là **git tag `vX.Y.Z`** (semver), KHÔNG phải mỗi commit của `main`.
Máy người dùng ghim vào một tag; `update.sh`/`.bat` mới chuyển tag (có chạy `npm test`,
lỗi thì tự rollback). Vì vậy:
- `main` có thể chứa commit WIP — chúng KHÔNG tới máy ai cho tới khi được gắn thẻ.
- Phát hành: test xanh → bump `version` trong `package.json` (feature=minor, fix=patch,
  breaking=major) → `git tag vX.Y.Z` **khớp** version → push kèm `--tags`.
- `VERSION` (đọc từ `package.json` trong `app-config.ts`) hiện trên banner → tag và
  `package.json` phải luôn khớp.
- `start.*` chỉ BÁO khi có tag mới (không tự `git pull`). Đừng thêm lại auto-pull.
