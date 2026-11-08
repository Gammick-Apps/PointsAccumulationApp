@echo off

set "LOG=%~dp0drivers-log.txt"
>>"%LOG%" echo ==== install-drivers.cmd started %date% %time%
>>"%LOG%" echo user: %USERNAME%
ver >>"%LOG%" 2>&1
net session >nul 2>&1
if errorlevel 1 (
  >>"%LOG%" echo elevated: NO
) else (
  >>"%LOG%" echo elevated: yes
)

if not exist "%windir%\System32\libzkfp.dll" (
  >>"%LOG%" echo fingerprint driver: installing
  "%~dp0zk-driver-setup.exe" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART
  call :logExit "fingerprint setup exit code"
) else (
  >>"%LOG%" echo fingerprint driver: already installed
)
if exist "%windir%\System32\libzkfp.dll" (
  >>"%LOG%" echo libzkfp.dll after: present
) else (
  >>"%LOG%" echo libzkfp.dll after: MISSING
)

powershell -NoProfile -NonInteractive -Command "if (Get-Printer -Name 'BTP-R880NP*' -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  >>"%LOG%" echo printer: installing from "%~dp0printer-driver"
  if not exist "%~dp0printer-driver\Silent_Setup.exe" >>"%LOG%" echo printer: Silent_Setup.exe NOT FOUND
  pushd "%~dp0printer-driver"
  start "" /wait Silent_Setup.exe
  call :logExit "printer setup exit code"
  popd
) else (
  >>"%LOG%" echo printer: already installed
)

>>"%LOG%" echo --- printers after:
powershell -NoProfile -NonInteractive -Command "Get-Printer | ForEach-Object { '  ' + $_.Name + ' | ' + $_.DriverName + ' | ' + $_.PortName }" >>"%LOG%" 2>&1
>>"%LOG%" echo --- printer drivers after:
powershell -NoProfile -NonInteractive -Command "Get-PrinterDriver | ForEach-Object { '  ' + $_.Name }" >>"%LOG%" 2>&1
>>"%LOG%" echo --- USB printer devices connected:
powershell -NoProfile -NonInteractive -Command "Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -match 'BTP|SNBC|USB Printing|Printer' } | ForEach-Object { '  ' + $_.Status + ' | ' + $_.FriendlyName }" >>"%LOG%" 2>&1
>>"%LOG%" echo ==== install-drivers.cmd finished %date% %time%

exit /b 0

:logExit
>>"%LOG%" echo %~1: %errorlevel%
exit /b 0
