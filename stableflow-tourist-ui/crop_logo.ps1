Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\HaushTravel\.gemini\antigravity\scratch\stableflow-workspace\stableflow-tourist-ui\crux_logo.png"
$destPath = "C:\Users\HaushTravel\.gemini\antigravity\scratch\stableflow-workspace\stableflow-tourist-ui\crux_logo_transparent.png"

if (-not (Test-Path $srcPath)) {
    Write-Error "Original logo not found."
    exit 1
}

$src = [System.Drawing.Image]::FromFile($srcPath)
$w = $src.Width
$h = $src.Height

# Create a new transparent bitmap
$bmp = New-Object System.Drawing.Bitmap -ArgumentList $w, $h, "Format32bppArgb"
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::Transparent)

$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# Set squircle bounding box (excluding the outer 8.5% padding to crop inside the squircle)
$padding = $w * 0.085
$size = $w - ($padding * 2)
$rect = New-Object System.Drawing.RectangleF -ArgumentList $padding, $padding, $size, $size

# Draw rounded rectangle path
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$radius = $size * 0.23 # iOS corner radius proportion
$r2 = $radius * 2

$path.AddArc($rect.X, $rect.Y, $r2, $r2, 180, 90)
$path.AddArc(($rect.Right - $r2), $rect.Y, $r2, $r2, 270, 90)
$path.AddArc(($rect.Right - $r2), ($rect.Bottom - $r2), $r2, $r2, 0, 90)
$path.AddArc($rect.X, ($rect.Bottom - $r2), $r2, $r2, 90, 90)
$path.CloseFigure()

# Clip and draw the original squircle
$g.SetClip($path)
$g.DrawImage($src, 0, 0, $w, $h)

$src.Dispose()
$g.Dispose()

# Save the resulting image
$bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Output "Successfully generated crux_logo_transparent.png!"
