# Saves the GIF deck again through PowerPoint with Geist embedded, so it looks right on machines
# without the font. Loads the fonts for this session only (no install).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File embed_fonts.ps1
param([string]$Name = "cropcash-pitch-gif.pptx")
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class Fonts {
  [DllImport("gdi32.dll", CharSet=CharSet.Unicode)] public static extern int AddFontResource(string f);
  [DllImport("gdi32.dll", CharSet=CharSet.Unicode)] public static extern bool RemoveFontResource(string f);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h, uint m, IntPtr w, IntPtr l, uint f, uint t, out IntPtr r);
}
"@
$deck = Join-Path $PSScriptRoot $Name
$temp = Join-Path $PSScriptRoot "embedding-$Name"
$fonts = "Regular", "SemiBold", "Bold" | ForEach-Object { Join-Path $PSScriptRoot "fonts\Geist-$_.ttf" }
$r = [IntPtr]::Zero
foreach ($f in $fonts) { [void][Fonts]::AddFontResource($f) }
[void][Fonts]::SendMessageTimeout([IntPtr]0xffff, 0x001D, [IntPtr]::Zero, [IntPtr]::Zero, 2, 3000, [ref]$r)
$app = New-Object -ComObject PowerPoint.Application
try {
  $p = $app.Presentations.Open($deck, -1, 0, 0)
  $p.SaveAs($temp, 24, -1)   # ppSaveAsOpenXMLPresentation, EmbedTrueTypeFonts
  $p.Close()
  Move-Item -Force $temp $deck -ErrorAction Stop
  "embedded: $deck"
} finally {
  foreach ($f in $fonts) { [void][Fonts]::RemoveFontResource($f) }
  [void][Fonts]::SendMessageTimeout([IntPtr]0xffff, 0x001D, [IntPtr]::Zero, [IntPtr]::Zero, 2, 3000, [ref]$r)
}
