!macro customInstall
  CreateDirectory "$APPDATA\\${PRODUCT_NAME}"
  FileOpen $0 "$APPDATA\\${PRODUCT_NAME}\\reset-sqlite-on-next-launch.flag" w
  FileWrite $0 "1"
  FileClose $0
!macroend
