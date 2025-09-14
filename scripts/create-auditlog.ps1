param(
  [string]$DatabaseUrl = 'postgresql://postgres:fulebimojviT1985%25@localhost:5432/ICE_ERP?schema=public'
)

$ErrorActionPreference = 'Stop'

Write-Host '==> Ensuring AuditLog schema via Prisma db execute...'
$env:DATABASE_URL = $DatabaseUrl

if (-not (Test-Path -LiteralPath "$PSScriptRoot\auditlog.sql")) {
  throw "Missing $PSScriptRoot\auditlog.sql"
}

try {
  Push-Location (Split-Path -Parent $PSScriptRoot)
  npx prisma db execute --file "$PSScriptRoot\auditlog.sql" --schema .\prisma\schema.prisma
  Write-Host '==> AuditLog ensured via Prisma.' -ForegroundColor Green
}
catch {
  Write-Warning "Prisma db execute failed: $($_.Exception.Message)"
  Write-Host '==> Falling back to Node script ensure_auditlog.js...'
  if (-not (Test-Path -LiteralPath "$PSScriptRoot\ensure_auditlog.js")) {
    throw "Missing $PSScriptRoot\ensure_auditlog.js for fallback"
  }
  node "$PSScriptRoot\ensure_auditlog.js"
}
finally {
  Pop-Location
}

Write-Host '==> Done.' -ForegroundColor Green

