!macro customInstall
  FileOpen $5 "$INSTDIR\resources\drivers-log.txt" w
  FileWrite $5 "==== installer: customInstall$\r$\n"
  IfSilent 0 not_silent
    FileWrite $5 "silent install - drivers skipped$\r$\n"
    Goto drivers_done
  not_silent:
  IfFileExists "$INSTDIR\resources\install-drivers.cmd" script_found 0
    FileWrite $5 "install-drivers.cmd not found - drivers skipped$\r$\n"
    Goto drivers_done
  script_found:

  StrCpy $1 "0"
  IfFileExists "$WINDIR\Sysnative\libzkfp.dll" zk_present
  IfFileExists "$WINDIR\System32\libzkfp.dll" zk_present
  StrCpy $1 "1"
  FileWrite $5 "fingerprint driver: missing$\r$\n"
  Goto zk_checked
  zk_present:
  FileWrite $5 "fingerprint driver: present$\r$\n"
  zk_checked:
  nsExec::Exec 'powershell -NoProfile -NonInteractive -Command "if (Get-Printer -Name ''BTP-R880NP*'' -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"'
  Pop $2
  FileWrite $5 "printer check exit code: $2 (0 = printer exists)$\r$\n"
  StrCmp $2 "0" printer_present
  StrCpy $1 "1"
  printer_present:
  StrCmp $1 "0" 0 run_script
    FileWrite $5 "both drivers present - script not run$\r$\n"
    Goto drivers_done
  run_script:

  DetailPrint "Installing the fingerprint reader and printer drivers..."
  FileWrite $5 "running install-drivers.cmd (runas)$\r$\n"
  FileClose $5
  ClearErrors
  ExecShellWait "runas" "$INSTDIR\resources\install-drivers.cmd" "" SW_HIDE
  StrCpy $6 "ok"
  IfErrors 0 +2
    StrCpy $6 "error (declined or failed to start)"
  FileOpen $5 "$INSTDIR\resources\drivers-log.txt" a
  FileSeek $5 0 END
  FileWrite $5 "runas result: $6$\r$\n"
  FileWrite $5 "==== installer: done$\r$\n"
  drivers_done:
  FileClose $5

  ; The receipt printer must be the Windows default printer. Runs on every
  ; install and update (silent too), after the driver is installed. The
  ; installer runs as the regular user (perMachine=false), so the per-user
  ; default lands on the right account, not the admin of install-drivers.cmd.
  IfFileExists "$INSTDIR\resources\set-default-printer.ps1" 0 default_printer_done
  StrCpy $7 "powershell"
  ; The installer is 32-bit; Sysnative runs the 64-bit PowerShell
  IfFileExists "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe" 0 +2
    StrCpy $7 "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
  DetailPrint "Setting the receipt printer as the default printer..."
  nsExec::Exec '"$7" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\set-default-printer.ps1" -Log "$INSTDIR\resources\drivers-log.txt"'
  Pop $7
  default_printer_done:
!macroend
