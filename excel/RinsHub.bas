Attribute VB_Name = "RinsHub"
' RINS Hub - Excel link (Windows Excel)
' Refresh: pulls a copy of the hub's data into the data sheets.
' Send to hub: saves the rows typed on the "New ..." sheets into the hub.
' Your Excel key is kept on this computer (not inside the file), so the
' workbook can be shared without sharing your access.
Option Explicit

Private Const REG_APP As String = "RINS Hub"
Private Const REG_SEC As String = "Excel link"
Private Const DATA_SHEETS As String = "Products|Branches|Stock|Stock moves|Sales|Transactions|Accounts|Profit and loss|Categories"

' ======================= buttons =======================

Public Sub RefreshFromHub()
    If DoRefresh(True) Then
        MsgBox "Refreshed from RINS Hub.", vbInformation, "RINS Hub"
    End If
End Sub

Public Sub SendToHub()
    Dim body As String, cnt As Long, resp As String
    Dim res As Object, okN As Long, errN As Long
    On Error GoTo Failed
    Application.StatusBar = "Sending to RINS Hub..."
    AddRows "New sales", "tblNewSales", "#SALES", Array("Date", "Branch", "Product", "Qty", "Note"), body, cnt
    AddRows "New stock moves", "tblNewMoves", "#MOVES", Array("Date", "Type", "Product", "From", "To", "Qty", "Note"), body, cnt
    AddRows "New money", "tblNewMoney", "#MONEY", Array("Date", "Type", "Account", "To account", "Category", "Amount", "Paid to / from", "Branch", "Description", "Reference", "Receipt link"), body, cnt
    If cnt = 0 Then
        Application.StatusBar = False
        MsgBox "There is nothing new to send." & vbCrLf & "Type rows on the New sales, New stock moves or New money sheets first.", vbInformation, "RINS Hub"
        Exit Sub
    End If
    resp = HubCall("excel_send", body, "text/plain; charset=utf-8")
    Set res = ParseResults(resp)
    ApplyResults "New sales", "tblNewSales", res, okN, errN
    ApplyResults "New stock moves", "tblNewMoves", res, okN, errN
    ApplyResults "New money", "tblNewMoney", res, okN, errN
    SetStart "LastSend", Format(Now, "yyyy-mm-dd hh:nn") & "  (" & okN & " saved, " & errN & " to fix)"
    Application.StatusBar = False
    If okN > 0 Then DoRefresh False
    If errN = 0 Then
        MsgBox okN & " row(s) saved to RINS Hub.", vbInformation, "RINS Hub"
    Else
        MsgBox okN & " row(s) saved." & vbCrLf & errN & " row(s) need fixing. The reason is in the Status column." & vbCrLf & _
               "Fix them and click Send to hub again. Saved rows are never sent twice.", vbExclamation, "RINS Hub"
    End If
    Exit Sub
Failed:
    Application.StatusBar = False
    Dim noRes As Object
    Set noRes = CreateObject("Scripting.Dictionary")
    ApplyResults "New sales", "tblNewSales", noRes, okN, errN
    ApplyResults "New stock moves", "tblNewMoves", noRes, okN, errN
    ApplyResults "New money", "tblNewMoney", noRes, okN, errN
    MsgBox "Could not send." & vbCrLf & vbCrLf & Err.Description, vbCritical, "RINS Hub"
End Sub

Public Sub SetMyKey()
    Dim k As String
    k = Trim(InputBox("Paste your Excel key." & vbCrLf & vbCrLf & _
        "Create one on the hub: Company > Excel link. It starts with rins_" & vbCrLf & vbCrLf & _
        "It is saved on this computer only, not inside the file.", "RINS Hub - Excel key"))
    If k = "" Then Exit Sub
    If Left(k, 5) <> "rins_" Or Len(k) < 20 Then
        MsgBox "That doesn't look like an Excel key. It should start with rins_", vbExclamation, "RINS Hub"
        Exit Sub
    End If
    SaveSetting REG_APP, REG_SEC, "Key", k
    ShowKeyStatus
    If MsgBox("Key saved on this computer. Refresh from the hub now?", vbYesNo + vbQuestion, "RINS Hub") = vbYes Then RefreshFromHub
End Sub

Public Sub ForgetMyKey()
    On Error Resume Next
    DeleteSetting REG_APP, REG_SEC, "Key"
    On Error GoTo 0
    ShowKeyStatus
    MsgBox "The Excel key was removed from this computer.", vbInformation, "RINS Hub"
End Sub

Public Sub ClearSavedRows()
    Dim n As Long
    n = n + ClearSaved("New sales", "tblNewSales")
    n = n + ClearSaved("New stock moves", "tblNewMoves")
    n = n + ClearSaved("New money", "tblNewMoney")
    MsgBox n & " saved row(s) cleared. Rows still to fix were kept.", vbInformation, "RINS Hub"
End Sub

' Run once after importing this code: adds the buttons to the sheets.
Public Sub SetupButtons()
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets("Start")
    On Error Resume Next
    ws.Buttons.Delete
    On Error GoTo 0
    Dim x As Double
    x = ws.Range("D3").Left + 6
    AddButton ws, x, ws.Range("D3").Top, 150, "Refresh from hub", "RefreshFromHub"
    AddButton ws, x, ws.Range("D5").Top, 150, "Send to hub", "SendToHub"
    AddButton ws, x, ws.Range("D7").Top, 150, "Set my key", "SetMyKey"
    AddButton ws, x, ws.Range("D9").Top, 150, "Forget my key", "ForgetMyKey"
    Dim nm As Variant
    For Each nm In Array("New sales", "New stock moves", "New money")
        Set ws = ThisWorkbook.Worksheets(CStr(nm))
        On Error Resume Next
        ws.Buttons.Delete
        On Error GoTo 0
        AddButton ws, 6, ws.Range("A2").Top, 120, "Send to hub", "SendToHub"
        AddButton ws, 136, ws.Range("A2").Top, 130, "Clear saved rows", "ClearSavedRows"
        AddButton ws, 276, ws.Range("A2").Top, 130, "Refresh from hub", "RefreshFromHub"
    Next
    ShowKeyStatus
    ThisWorkbook.Worksheets("Start").Activate
    MsgBox "Buttons added. Next: click Set my key on the Start sheet.", vbInformation, "RINS Hub"
End Sub

' ======================= refresh =======================

Private Function DoRefresh(ByVal loud As Boolean) As Boolean
    Dim txt As String, lines() As String, i As Long, j As Long, last As Long
    Dim nm As String, hdr() As String, typ() As String, got As String, s As Variant
    On Error GoTo Failed
    Application.StatusBar = "Refreshing from RINS Hub..."
    Application.ScreenUpdating = False
    txt = HubCall("excel_feed", "{}", "application/json")
    lines = Split(Replace(txt, vbCr, ""), vbLf)
    got = "|"
    i = 0
    Do While i <= UBound(lines)
        If Left(lines(i), 7) = "#TABLE " And i + 2 <= UBound(lines) Then
            nm = Mid(lines(i), 8)
            hdr = Split(lines(i + 1), vbTab)
            typ = Split(lines(i + 2), vbTab)
            j = i + 3
            Do While j <= UBound(lines)
                If Left(lines(j), 7) = "#TABLE " Then Exit Do
                j = j + 1
            Loop
            last = j - 1
            Do While last >= i + 3
                If Len(lines(last)) > 0 Then Exit Do
                last = last - 1
            Loop
            If nm = "Info" Then
                WriteInfo lines, i + 3, last
            Else
                WriteTable nm, hdr, typ, lines, i + 3, last
                got = got & nm & "|"
            End If
            i = j
        Else
            i = i + 1
        End If
    Loop
    ' Sheets this key may not see (for example finance) are emptied, never left stale
    For Each s In Split(DATA_SHEETS, "|")
        If InStr(got, "|" & s & "|") = 0 Then EmptySheet CStr(s)
    Next
    ShowKeyStatus
    Application.ScreenUpdating = True
    Application.StatusBar = False
    DoRefresh = True
    Exit Function
Failed:
    Application.ScreenUpdating = True
    Application.StatusBar = False
    If loud Then
        MsgBox "Could not refresh." & vbCrLf & vbCrLf & Err.Description, vbCritical, "RINS Hub"
    Else
        MsgBox "Saved, but the refresh afterwards failed:" & vbCrLf & Err.Description, vbExclamation, "RINS Hub"
    End If
End Function

Private Sub WriteInfo(lines() As String, ByVal a As Long, ByVal b As Long)
    Dim k As Long, p() As String
    For k = a To b
        p = Split(lines(k), vbTab)
        If UBound(p) >= 1 Then
            Select Case p(0)
                Case "Refreshed": SetStart "LastRefresh", p(1)
                Case "Key": SetStart "KeyName", p(1)
                Case "Access": SetStart "KeyAccess", p(1)
            End Select
        End If
    Next
End Sub

Private Sub WriteTable(ByVal sheetName As String, hdr() As String, typ() As String, lines() As String, ByVal a As Long, ByVal b As Long)
    Dim ws As Worksheet, lo As ListObject, tblName As String
    Dim nCols As Long, nRows As Long, r As Long, c As Long, p() As String, arr() As Variant
    Set ws = GetSheet(sheetName)
    tblName = "tbl" & Replace(sheetName, " ", "")
    nCols = UBound(hdr) + 1
    nRows = b - a + 1
    If nRows < 0 Then nRows = 0

    On Error Resume Next
    Set lo = ws.ListObjects(tblName)
    On Error GoTo 0
    If Not lo Is Nothing Then
        If Not SameHeaders(lo, hdr) Then
            lo.Delete
            Set lo = Nothing
        End If
    End If
    If lo Is Nothing Then
        ws.Cells.Clear
        For c = 1 To nCols
            ws.Cells(1, c).NumberFormat = "@"
            ws.Cells(1, c).Value = hdr(c - 1)
        Next
        Set lo = ws.ListObjects.Add(1, ws.Range(ws.Cells(1, 1), ws.Cells(2, nCols)), , 1)
        lo.Name = tblName
        lo.TableStyle = "TableStyleMedium2"
    Else
        If Not lo.DataBodyRange Is Nothing Then lo.DataBodyRange.Delete
    End If
    lo.Resize ws.Range(ws.Cells(1, 1), ws.Cells(1 + IIf(nRows > 0, nRows, 1), nCols))
    For c = 1 To nCols
        lo.ListColumns(c).DataBodyRange.NumberFormat = ColFormat(hdr(c - 1), typ(c - 1))
    Next
    If nRows > 0 Then
        ReDim arr(1 To nRows, 1 To nCols)
        For r = 1 To nRows
            p = Split(lines(a + r - 1), vbTab)
            For c = 1 To nCols
                If c - 1 <= UBound(p) Then arr(r, c) = CellValue(p(c - 1), typ(c - 1))
            Next
        Next
        lo.DataBodyRange.Value = arr
    Else
        lo.DataBodyRange.ClearContents
    End If
    ws.Columns.AutoFit
    For c = 1 To nCols
        If ws.Columns(c).ColumnWidth > 50 Then ws.Columns(c).ColumnWidth = 50
    Next
End Sub

Private Sub EmptySheet(ByVal sheetName As String)
    Dim ws As Worksheet, i As Long
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(sheetName)
    On Error GoTo 0
    If ws Is Nothing Then Exit Sub
    For i = ws.ListObjects.Count To 1 Step -1
        ws.ListObjects(i).Delete
    Next
    ws.Cells.Clear
    ws.Range("A1").Value = "Your Excel key does not include this sheet."
End Sub

Private Function SameHeaders(lo As ListObject, hdr() As String) As Boolean
    Dim c As Long
    If lo.ListColumns.Count <> UBound(hdr) + 1 Then Exit Function
    For c = 1 To lo.ListColumns.Count
        If lo.ListColumns(c).Name <> hdr(c - 1) Then Exit Function
    Next
    SameHeaders = True
End Function

Private Function CellValue(ByVal s As String, ByVal t As String) As Variant
    If Len(s) = 0 Then
        CellValue = Empty
    ElseIf t = "n" Then
        CellValue = Val(s)
    ElseIf t = "d" And Len(s) >= 10 Then
        CellValue = DateSerial(CInt(Left(s, 4)), CInt(Mid(s, 6, 2)), CInt(Mid(s, 9, 2)))
    Else
        CellValue = s
    End If
End Function

Private Function ColFormat(ByVal h As String, ByVal t As String) As String
    If t = "d" Then
        ColFormat = "yyyy-mm-dd"
    ElseIf t = "n" Then
        If h = "Qty" Or h = "Keep" Or h = "Alert at" Or h = "To send" Or InStr(h, "days") > 0 Then
            ColFormat = "#,##0"
        ElseIf InStr(h, "%") > 0 Then
            ColFormat = "0.0"
        Else
            ColFormat = "#,##0.000;[Red]-#,##0.000"
        End If
    Else
        ColFormat = "@"
    End If
End Function

' ======================= send =======================

Private Sub AddRows(ByVal sheetName As String, ByVal tblName As String, ByVal section As String, cols As Variant, ByRef body As String, ByRef cnt As Long)
    Dim lo As ListObject, lr As ListRow, k As Long, v As Variant, rowText As String, isBlank As Boolean
    Dim stCol As Long, refCol As Long, st As String, ref As String, first As Boolean
    Set lo = GetTable(sheetName, tblName)
    If lo Is Nothing Then Exit Sub
    stCol = lo.ListColumns("Status").Index
    refCol = lo.ListColumns("Ref").Index
    first = True
    For Each lr In lo.ListRows
        isBlank = True
        For k = LBound(cols) To UBound(cols)
            If Len(Trim(CStr(lr.Range.Cells(1, lo.ListColumns(cols(k)).Index).Value))) > 0 Then isBlank = False
        Next
        st = CStr(lr.Range.Cells(1, stCol).Value)
        If Not isBlank And Left(st, 1) <> ChrW(&H2713) Then
            ref = Trim(CStr(lr.Range.Cells(1, refCol).Value))
            If ref = "" Then
                Randomize
                ref = "x" & Format(Now, "yymmddhhnnss") & "-" & lr.Index & "-" & CStr(Int(Rnd * 1000000))
                lr.Range.Cells(1, refCol).NumberFormat = "@"
                lr.Range.Cells(1, refCol).Value = ref
            End If
            rowText = ref
            For k = LBound(cols) To UBound(cols)
                v = lr.Range.Cells(1, lo.ListColumns(cols(k)).Index).Value
                rowText = rowText & vbTab & CellText(v, CStr(cols(k)))
            Next
            If first Then
                body = body & section & vbLf
                first = False
            End If
            body = body & rowText & vbLf
            lr.Range.Cells(1, stCol).Value = "Sending..."
            cnt = cnt + 1
        End If
    Next
End Sub

Private Function CellText(ByVal v As Variant, ByVal colName As String) As String
    Dim s As String
    If IsEmpty(v) Or IsNull(v) Then
        CellText = ""
        Exit Function
    End If
    If IsError(v) Then
        CellText = ""
        Exit Function
    End If
    If colName = "Date" Then
        If VarType(v) = vbDate Then
            s = Format(v, "yyyy-mm-dd")
        ElseIf IsNumeric(v) Then
            s = Format(CDate(v), "yyyy-mm-dd")
        Else
            s = CStr(v)
        End If
    ElseIf VarType(v) = vbDouble Or VarType(v) = vbCurrency Or VarType(v) = vbSingle Or VarType(v) = vbInteger Or VarType(v) = vbLong Or VarType(v) = vbDecimal Then
        s = Trim(Str(v))
    Else
        s = CStr(v)
    End If
    s = Replace(Replace(Replace(s, vbTab, " "), vbCr, " "), vbLf, " ")
    CellText = Trim(s)
End Function

Private Function ParseResults(ByVal resp As String) As Object
    Dim d As Object, ln As Variant, p() As String
    Set d = CreateObject("Scripting.Dictionary")
    For Each ln In Split(Replace(resp, vbCr, ""), vbLf)
        If Len(ln) > 0 Then
            p = Split(ln, vbTab)
            If UBound(p) >= 2 Then d(p(0)) = Array(p(1), p(2))
        End If
    Next
    Set ParseResults = d
End Function

Private Sub ApplyResults(ByVal sheetName As String, ByVal tblName As String, res As Object, ByRef okN As Long, ByRef errN As Long)
    Dim lo As ListObject, lr As ListRow, ref As String, stCell As Range, x As Variant
    Set lo = GetTable(sheetName, tblName)
    If lo Is Nothing Then Exit Sub
    For Each lr In lo.ListRows
        ref = Trim(CStr(lr.Range.Cells(1, lo.ListColumns("Ref").Index).Value))
        Set stCell = lr.Range.Cells(1, lo.ListColumns("Status").Index)
        If ref <> "" And res.Exists(ref) Then
            x = res(ref)
            If x(0) = "OK" Then
                stCell.Value = ChrW(&H2713) & " " & x(1)
                stCell.Font.Color = RGB(31, 138, 76)
                okN = okN + 1
            Else
                stCell.Value = ChrW(&H2717) & " " & x(1)
                stCell.Font.Color = RGB(192, 57, 43)
                errN = errN + 1
            End If
        ElseIf CStr(stCell.Value) = "Sending..." Then
            stCell.Value = ""
        End If
    Next
End Sub

Private Function ClearSaved(ByVal sheetName As String, ByVal tblName As String) As Long
    Dim lo As ListObject, i As Long
    Set lo = GetTable(sheetName, tblName)
    If lo Is Nothing Then Exit Function
    For i = lo.ListRows.Count To 1 Step -1
        If Left(CStr(lo.ListRows(i).Range.Cells(1, lo.ListColumns("Status").Index).Value), 1) = ChrW(&H2713) Then
            If lo.ListRows.Count > 1 Then
                lo.ListRows(i).Delete
            Else
                lo.ListRows(i).Range.ClearContents
            End If
            ClearSaved = ClearSaved + 1
        End If
    Next
End Function

' ======================= talking to the hub =======================

Private Function HubCall(ByVal fn As String, ByVal body As String, ByVal contentType As String) As String
    Dim key As String, url As String, pub As String, http As Object, txt As String
    key = GetSetting(REG_APP, REG_SEC, "Key", "")
    If key = "" Then Err.Raise vbObjectError + 1, "RINS Hub", "There is no Excel key on this computer yet. Click Set my key on the Start sheet."
    url = Trim(CStr(ThisWorkbook.Names("HubUrl").RefersToRange.Value))
    If Right(url, 1) = "/" Then url = Left(url, Len(url) - 1)
    pub = Trim(CStr(ThisWorkbook.Names("HubPublicKey").RefersToRange.Value))
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.setTimeouts 15000, 15000, 60000, 180000
    http.Open "POST", url & "/rest/v1/rpc/" & fn, False
    http.setRequestHeader "apikey", pub
    http.setRequestHeader "x-hub-key", key
    http.setRequestHeader "Accept", "text/plain"
    http.setRequestHeader "Content-Type", contentType
    http.send Utf8Bytes(body)
    txt = Utf8Text(http.responseBody)
    If http.Status <> 200 Then Err.Raise vbObjectError + 2, "RINS Hub", HubError(txt, http.Status)
    HubCall = txt
End Function

Private Function HubError(ByVal txt As String, ByVal status As Long) As String
    Dim p As Long, ch As String, msg As String
    p = InStr(txt, """message"":""")
    If p > 0 Then
        p = p + 11
        Do While p <= Len(txt)
            ch = Mid(txt, p, 1)
            If ch = "\" Then
                msg = msg & Mid(txt, p + 1, 1)
                p = p + 2
            ElseIf ch = """" Then
                Exit Do
            Else
                msg = msg & ch
                p = p + 1
            End If
        Loop
    End If
    If status = 404 Then
        HubError = "The Excel link isn't set up on the hub yet. Run supabase/excel.sql in the Supabase SQL Editor."
    ElseIf status = 401 Then
        HubError = "The hub refused the connection. Check the Hub address and Public key on the Start sheet." & IIf(msg <> "", vbCrLf & msg, "")
    ElseIf msg <> "" Then
        HubError = msg
    Else
        HubError = "The hub answered with error " & status & "."
    End If
End Function

Private Function Utf8Bytes(ByVal s As String) As Variant
    Dim st As Object
    Set st = CreateObject("ADODB.Stream")
    st.Type = 2
    st.Charset = "utf-8"
    st.Open
    st.WriteText s
    st.Position = 0
    st.Type = 1
    st.Position = 3
    Utf8Bytes = st.Read
    st.Close
End Function

Private Function Utf8Text(ByVal b As Variant) As String
    Dim st As Object
    On Error GoTo Done
    If IsEmpty(b) Or IsNull(b) Then Exit Function
    If UBound(b) < LBound(b) Then Exit Function
    Set st = CreateObject("ADODB.Stream")
    st.Type = 1
    st.Open
    st.Write b
    st.Position = 0
    st.Type = 2
    st.Charset = "utf-8"
    Utf8Text = st.ReadText
    st.Close
Done:
End Function

' ======================= helpers =======================

Private Function GetSheet(ByVal nm As String) As Worksheet
    On Error Resume Next
    Set GetSheet = ThisWorkbook.Worksheets(nm)
    On Error GoTo 0
    If GetSheet Is Nothing Then
        Set GetSheet = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
        GetSheet.Name = nm
    End If
End Function

Private Function GetTable(ByVal sheetName As String, ByVal tblName As String) As ListObject
    On Error Resume Next
    Set GetTable = ThisWorkbook.Worksheets(sheetName).ListObjects(tblName)
    On Error GoTo 0
End Function

Private Sub SetStart(ByVal nm As String, ByVal v As String)
    On Error Resume Next
    ThisWorkbook.Names(nm).RefersToRange.NumberFormat = "@"
    ThisWorkbook.Names(nm).RefersToRange.Value = v
End Sub

Private Sub ShowKeyStatus()
    Dim k As String
    k = GetSetting(REG_APP, REG_SEC, "Key", "")
    If k = "" Then
        SetStart "KeyStatus", "Not set on this computer. Click Set my key."
    Else
        SetStart "KeyStatus", "Saved on this computer (ends ..." & Right(k, 4) & ")"
    End If
End Sub

Private Sub AddButton(ws As Worksheet, ByVal x As Double, ByVal y As Double, ByVal w As Double, ByVal caption As String, ByVal macro As String)
    Dim b As Object
    Set b = ws.Buttons.Add(x, y + 2, w, 26)
    b.Caption = caption
    b.OnAction = macro
End Sub
