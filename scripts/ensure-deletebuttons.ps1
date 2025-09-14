param()

$ErrorActionPreference = 'Stop'

function Ensure-Dir([string]$p) {
  $d = Split-Path -Parent $p
  if ($d -and -not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Path $d | Out-Null }
}

function Ensure-Text([string]$p, [string]$t) {
  Ensure-Dir $p
  Set-Content -LiteralPath $p -Encoding UTF8 -Value $t
}

function Patch-Import([string]$f, [string]$t) {
  if (-not (Test-Path -LiteralPath $f)) { Write-Host "- Skip    $f (not found)"; return }
  $r = Get-Content -Raw -LiteralPath $f
  $pat = 'import\s+DeleteButton\s+from\s+"[^"]*DeleteButton";'
  $rep = 'import DeleteButton from "' + $t + '";'
  $u  = [regex]::Replace($r, $pat, $rep)
  if ($u -ne $r) { Set-Content -LiteralPath $f -Encoding UTF8 -Value $u; Write-Host "~ Patched $f" } else { Write-Host "= OK      $f (no change)" }
}

$proj = Split-Path -Parent $PSScriptRoot

# Shared client DeleteButton
$sharedPath = Join-Path $proj 'app/dictionaries/DeleteButton.tsx'
$shared = @"
"use client";
import * as React from "react";
type Props = {
  action: (formData: FormData) => Promise<void> | void;
  className?: string;
  label?: string;
  confirmMessage?: string;
};
export default function DeleteButton({ action, className, label = "Delete", confirmMessage = "Are you sure you want to delete?" }: Props) {
  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!confirm(confirmMessage)) { e.preventDefault(); e.stopPropagation(); }
  };
  return (
    <button type="submit" className={className} formAction={action} onClick={onClick}>
      {label}
    </button>
  );
}
"@
Ensure-Text $sharedPath $shared

# Local re-exports per dictionary
$reexp = 'export { default } from "../DeleteButton";'
Ensure-Text (Join-Path $proj 'app/dictionaries/countries/DeleteButton.tsx')     $reexp
Ensure-Text (Join-Path $proj 'app/dictionaries/counteragents/DeleteButton.tsx') $reexp
Ensure-Text (Join-Path $proj 'app/dictionaries/entity-types/DeleteButton.tsx')  $reexp

# Patch imports in edit pages to point to local re-exports
Patch-Import (Join-Path $proj 'app/dictionaries/countries/[id]/edit/page.tsx')     '../../DeleteButton'
Patch-Import (Join-Path $proj 'app/dictionaries/entity-types/[id]/edit/page.tsx')  '../../DeleteButton'
Patch-Import (Join-Path $proj 'app/dictionaries/counteragents/[id]/page.tsx')      '../DeleteButton'

Write-Host "==> DeleteButtons ensured and imports patched." -ForegroundColor Green

