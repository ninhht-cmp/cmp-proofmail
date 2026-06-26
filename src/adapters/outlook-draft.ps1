# Opens a pre-filled mail DRAFT in classic Outlook desktop (does NOT send) so the
# operator clicks Send by hand. Driven by src/adapters/outlook-draft.js, which
# writes the payload (subject, recipient, inline-image list) as a JSON file and
# the HTML body as a separate UTF-8 file — passing big HTML on the command line
# would mangle quotes and Vietnamese characters, so we read both from disk.
#
# Exit codes: 0 = draft opened · 2 = Outlook COM unavailable (e.g. "New Outlook",
# which has no COM automation — only classic Outlook does) · 1 = other failure.
param([Parameter(Mandatory = $true)][string]$Payload)

$ErrorActionPreference = 'Stop'

try {
  $json = Get-Content -LiteralPath $Payload -Raw -Encoding UTF8 | ConvertFrom-Json
  $html = Get-Content -LiteralPath $json.htmlPath -Raw -Encoding UTF8
} catch {
  Write-Error "Không đọc được dữ liệu nháp: $($_.Exception.Message)"
  exit 1
}

# Connect to (or start) classic Outlook desktop via COM. "New Outlook" and
# Outlook on the web do NOT expose this object → clear message, distinct exit.
try {
  $outlook = New-Object -ComObject Outlook.Application
} catch {
  Write-Error "Không mở được Outlook. Tính năng này cần Outlook 'Classic' trên Windows (New Outlook và Outlook web không hỗ trợ). Chi tiết: $($_.Exception.Message)"
  exit 2
}

$mail = $outlook.CreateItem(0)   # 0 = olMailItem
$mail.To = $json.to
$mail.Subject = $json.subject
$mail.HTMLBody = $html

# Inline images: attach each file, tag it with its Content-ID so the cid: refs in
# the HTML body resolve, and hide it from the visible attachment list. olByValue
# (1) copies the bytes into the item, so the temp files are safe to delete after.
foreach ($att in $json.attachments) {
  if (-not (Test-Path -LiteralPath $att.path)) { continue }
  $a = $mail.Attachments.Add($att.path, 1, $null, $att.filename)
  $pa = $a.PropertyAccessor
  $pa.SetProperty('http://schemas.microsoft.com/mapi/proptag/0x3712001F', $att.cid)  # PR_ATTACH_CONTENT_ID
  $pa.SetProperty('http://schemas.microsoft.com/mapi/proptag/0x7FFE000B', $true)      # PR_ATTACHMENT_HIDDEN
}

# Outlook may hold several accounts. When MAIL_FROM_EMAIL is known, send the draft
# from the matching mailbox; otherwise fall back to the default account silently.
if ($json.fromEmail) {
  foreach ($acct in $outlook.Session.Accounts) {
    if ($acct.SmtpAddress -eq $json.fromEmail) { $mail.SendUsingAccount = $acct; break }
  }
}

# Non-modal: pop the compose window and return immediately, leaving it open for
# the operator to review and click Send. We never call .Send() — that's by hand.
$mail.Display($false)
exit 0
