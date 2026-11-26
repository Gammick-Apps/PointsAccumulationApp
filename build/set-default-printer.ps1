# מגדיר את מדפסת הקבלות (SNBC BTP-R880NP) כמדפסת ברירת המחדל של Windows.
# רץ מההתקנה כמשתמש הרגיל ולא בהרשאות מנהל, כי ברירת המחדל נשמרת לכל משתמש בנפרד.
# ההתקנה השקטה של SNBC לא יודעת להגדיר ברירת מחדל, לכן ההתקנה שלנו עושה את זה בעצמה.
param([string]$Log)

function Write-Log([string]$message) {
    if ($Log) { Add-Content -Path $Log -Value $message -ErrorAction SilentlyContinue }
}

Write-Log "==== set-default-printer.ps1 started $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Log "user: $env:USERNAME"

try {
    # Get-WmiObject ולא Get-Printer, כדי שיעבוד גם ב-Windows 7
    $printers = @(Get-WmiObject Win32_Printer -ErrorAction Stop | Where-Object { $_.Name -like 'BTP-R880NP*' })
    if ($printers.Count -eq 0) {
        Write-Log "receipt printer not installed - skipped"
        exit 0
    }

    # כשיש כמה תורים של אותה מדפסת, זה שמחובר ב-USB הוא המדפסת עצמה
    $chosen = $printers | Where-Object { $_.PortName -like 'USB*' } | Select-Object -First 1
    if (-not $chosen) { $chosen = $printers[0] }

    # בלי זה Windows מחזיר לברירת מחדל את המדפסת שהדפיסו בה לאחרונה
    $key = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Windows'
    New-ItemProperty -Path $key -Name 'LegacyDefaultPrinterMode' -Value 1 -PropertyType DWord -Force | Out-Null
    Write-Log "LegacyDefaultPrinterMode = 1"

    (New-Object -ComObject WScript.Network).SetDefaultPrinter($chosen.Name)
    Write-Log "default printer set: $($chosen.Name) | port $($chosen.PortName)"
} catch {
    Write-Log "error: $($_.Exception.Message)"
}

exit 0
