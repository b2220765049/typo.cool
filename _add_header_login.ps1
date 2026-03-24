$files = Get-ChildItem -Recurse -Filter *.html | Where-Object { $_.FullName -notmatch '\\(apple|google|download|oauth)\\' }
foreach ($f in $files) {
  $content = Get-Content -Path $f.FullName -Raw
  if ($content -notmatch '<header>' -or $content -match 'header-login-btn') { continue }

  $loginHref = if ($f.FullName -match '\\(tests|party)\\') { '../login.html' } else { './login.html' }
  $buttonHtml = "`r`n      <a class=\"header-login-btn\" href=\"$loginHref\">Giriş Yap</a>"
  $updated = [regex]::Replace($content, '</nav>', '</nav>' + $buttonHtml, 1)

  if ($updated -ne $content) {
    Set-Content -Path $f.FullName -Value $updated -Encoding UTF8
  }
}
Write-Output 'Inserted header login buttons.'
