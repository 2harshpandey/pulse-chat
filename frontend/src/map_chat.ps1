$lines = Get-Content 'frontend/src/Chat.tsx'
$total = $lines.Count
Write-Host "Total lines: $total"
for ($i = 0; $i -lt $total; $i++) {
    $l = $lines[$i]
    if ($l -match '^(const [a-zA-Z]|export const [a-zA-Z]|function [a-zA-Z]|export function [a-zA-Z]|// ---|\s*\/\/ ===)') {
        Write-Host "$($i+1): $l"
    }
}
