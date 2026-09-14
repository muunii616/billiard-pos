!macro customInstall
  DetailPrint "Installing Microsoft Visual C++ runtime..."
  ExecWait '"$INSTDIR\resources\payload\vc_redist.x64.exe" /install /quiet /norestart' $0
  ${If} $0 == 3010
    SetRebootFlag true
  ${ElseIf} $0 != 0
  ${AndIf} $0 != 1638
    MessageBox MB_OK|MB_ICONSTOP "Microsoft Visual C++ runtime installation failed (code $0). Restart Windows and run Setup again."
    Abort
  ${EndIf}
!macroend
