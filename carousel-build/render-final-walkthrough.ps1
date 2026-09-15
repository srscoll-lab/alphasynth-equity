$ErrorActionPreference = "Stop"

$deckPath = "C:\Users\admin\Documents\ChatGPT\Alphasynth Intelligence\alphasynth-equity\carousel-output\AlphaSynth-Product-Walkthrough-Carousel-Final-v8.pptx"
$renderPath = "C:\Users\admin\Documents\ChatGPT\Alphasynth Intelligence\alphasynth-equity\carousel-build\final-walkthrough-v8-render"

New-Item -ItemType Directory -Force -Path $renderPath | Out-Null

$powerPoint = New-Object -ComObject PowerPoint.Application
try {
  $presentation = $powerPoint.Presentations.Open($deckPath, -1, 0, -1)
  try {
    $presentation.Export($renderPath, "PNG", 1400, 1400)
  }
  finally {
    $presentation.Close()
  }
}
finally {
  $powerPoint.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint) | Out-Null
}

Get-ChildItem -Path $renderPath -Filter "Slide*.PNG" | Sort-Object Name | Select-Object Name, Length
