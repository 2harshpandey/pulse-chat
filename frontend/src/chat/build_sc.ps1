$src = Get-Content 'frontend/src/Chat.tsx' -Encoding UTF8
$header = @(
  "import styled, { createGlobalStyle, keyframes, css } from 'styled-components';"
  ""
)
$part1 = $src[36..3040]
$part2 = $src[4721..4810]
$all = $header + $part1 + @("") + $part2
Set-Content -Path 'frontend/src/chat/ChatStyledComponents.tsx' -Value $all -Encoding UTF8
Write-Host "Written lines: $($all.Count)"
