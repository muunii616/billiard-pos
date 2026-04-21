Add-Type -AssemblyName System.Drawing

$srcPath = Join-Path $PSScriptRoot '..\public\logo.png'
$outPath = Join-Path $PSScriptRoot '..\public\favicon.ico'

$sizes = @(16, 32, 48, 64)
$src = [System.Drawing.Image]::FromFile($srcPath)

try {
    $pngBytesList = @()

    foreach ($s in $sizes) {
        $bmp = New-Object System.Drawing.Bitmap $s, $s
        $gfx = [System.Drawing.Graphics]::FromImage($bmp)

        try {
            $gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $gfx.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $gfx.Clear([System.Drawing.Color]::Transparent)

            # Preserve aspect ratio and fill the square: cover + center-crop (no squish, larger icon).
            $scale = [Math]::Max($s / $src.Width, $s / $src.Height)
            $w = [Math]::Max(1, [int][Math]::Round($src.Width * $scale))
            $h = [Math]::Max(1, [int][Math]::Round($src.Height * $scale))
            $x = [int][Math]::Floor(($s - $w) / 2)
            $y = [int][Math]::Floor(($s - $h) / 2)
            $gfx.DrawImage($src, $x, $y, $w, $h)

            $ms = New-Object System.IO.MemoryStream
            try {
                $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
                $pngBytesList += ,$ms.ToArray()
            } finally {
                $ms.Dispose()
            }
        } finally {
            $gfx.Dispose()
            $bmp.Dispose()
        }
    }

    $count = $pngBytesList.Count
    $headerSize = 6 + (16 * $count)
    $offset = $headerSize

    $fs = New-Object System.IO.FileStream($outPath, [System.IO.FileMode]::Create)
    $bw = New-Object System.IO.BinaryWriter($fs)

    try {
        # ICONDIR
        $bw.Write([UInt16]0)      # reserved
        $bw.Write([UInt16]1)      # type 1 = icon
        $bw.Write([UInt16]$count) # count

        for ($i = 0; $i -lt $count; $i++) {
            $size = $sizes[$i]
            $png = $pngBytesList[$i]

            $w = if ($size -ge 256) { 0 } else { [byte]$size }
            $h = if ($size -ge 256) { 0 } else { [byte]$size }

            # ICONDIRENTRY
            $bw.Write($w)                   # width
            $bw.Write($h)                   # height
            $bw.Write([byte]0)              # colors
            $bw.Write([byte]0)              # reserved
            $bw.Write([UInt16]1)            # planes
            $bw.Write([UInt16]32)           # bitcount
            $bw.Write([UInt32]$png.Length)  # bytes in resource
            $bw.Write([UInt32]$offset)      # image offset

            $offset += $png.Length
        }

        # image data
        for ($i = 0; $i -lt $count; $i++) {
            $bw.Write($pngBytesList[$i])
        }
    } finally {
        $bw.Dispose()
        $fs.Dispose()
    }
} finally {
    $src.Dispose()
}

Write-Output "Generated favicon.ico from logo.png"
