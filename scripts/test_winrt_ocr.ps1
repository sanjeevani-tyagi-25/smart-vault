param(
    [Parameter(Mandatory=$true)]
    [string]$ImagePath
)

$resolved = (Resolve-Path $ImagePath).Path

Add-Type -AssemblyName 'System.Runtime.WindowsRuntime'
[Windows.Media.Ocr.OcrEngine, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime] | Out-Null

function Await-AsyncOp($asyncOp) {
    $asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | 
        Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.IsGenericMethod } | 
        Select-Object -First 1
    
    # Try generic or non-generic
    if ($asyncOp.GetType().GetGenericArguments().Count -gt 0) {
        $typeArg = $asyncOp.GetType().GetGenericArguments()[0]
        $asTask = $asTaskGeneric.MakeGenericMethod($typeArg)
        $task = $asTask.Invoke($null, @($asyncOp))
    } else {
        $task = [System.WindowsRuntimeSystemExtensions]::AsTask($asyncOp)
    }
    $task.Wait()
    return $task.Result
}

$file = Await-AsyncOp ([Windows.Storage.StorageFile]::GetFileFromPathAsync($resolved))
$stream = Await-AsyncOp ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read))
$decoder = Await-AsyncOp ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream))
$bitmap = Await-AsyncOp ($decoder.GetSoftwareBitmapAsync())

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) {
    Write-Error "No OCR engine available for user profile language."
    exit 1
}

$result = Await-AsyncOp ($engine.RecognizeAsync($bitmap))
Write-Output $result.Text
