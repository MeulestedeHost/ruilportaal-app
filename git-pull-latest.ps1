# Haalt de laatste versie van de huidige branch op van GitHub (origin)
# Nuttig als je op meerdere toestellen werkt (bv. Windows voor de website/
# Capacitor-config, macOS/Xcode voor het iOS-project).
# Gebruik: .\git-pull-latest.ps1
Set-Location $PSScriptRoot

$status = git status --porcelain
if ($status) {
    Write-Host "Er staan nog niet-gecommitte wijzigingen lokaal. Commit of stash ze eerst (bv. met git-commit-local.ps1), anders kan pullen mislukken of ze overschrijven." -ForegroundColor Red
    exit 1
}

$branch = git branch --show-current
if (-not $branch) {
    Write-Host "Kan huidige branch niet bepalen." -ForegroundColor Red
    exit 1
}

Write-Host "Ophalen van branch '$branch' van origin..." -ForegroundColor Cyan
git pull origin $branch
