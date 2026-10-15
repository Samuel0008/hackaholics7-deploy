param(
  [Parameter(Mandatory = $true)]
  [string]$ResourceGroupName,
  [Parameter(Mandatory = $true)]
  [string]$Location,
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9]{3,10}$')]
  [string]$NamePrefix,
  [Parameter(Mandatory = $true)]
  [guid]$BankTenantId,
  [Parameter(Mandatory = $true)]
  [guid[]]$ApprovedClientIds,
  [Parameter(Mandatory = $true)]
  [string]$ApiAudience,
  [Parameter(Mandatory = $true)]
  [string]$AllowedOrigin,
  [Parameter(Mandatory = $true)]
  [string]$RelyingPartyId,
  [Parameter(Mandatory = $true)]
  [string]$RelyingPartyName,
  [Parameter(Mandatory = $true)]
  [string]$PublisherEmail,
  [Parameter(Mandatory = $true)]
  [string]$PublisherName,
  [ValidateSet('standard', 'premium')]
  [string]$KeyVaultSku = 'standard',
  [switch]$Deploy
)

$ErrorActionPreference = 'Stop'

if (-not $Deploy) {
  throw 'No cloud resources were created. Re-run with -Deploy only after reviewing the README cost and deployment notes.'
}

if ($AllowedOrigin -notmatch '^https://[A-Za-z0-9.-]+(?::[0-9]{1,5})?$') {
  throw 'AllowedOrigin must be a single HTTPS origin without a path.'
}
if ($RelyingPartyId -notmatch '^(?=.{1,253}$)[A-Za-z0-9.-]+$') {
  throw 'RelyingPartyId must be a valid hostname.'
}
if ($ApiAudience -notmatch '^[A-Za-z0-9:/._-]{1,256}$') {
  throw 'ApiAudience contains unsupported characters.'
}
if ($ApprovedClientIds.Count -eq 0) {
  throw 'At least one approved caller application client ID is required.'
}
if ($PublisherEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
  throw 'PublisherEmail must be a valid email address.'
}
if (-not (Get-Command az.cmd -ErrorAction SilentlyContinue)) {
  throw 'Azure CLI is not installed. Install it from Microsoft, then run az login.'
}
if (-not (Get-Command func.cmd -ErrorAction SilentlyContinue)) {
  throw 'Azure Functions Core Tools v4 is required to publish the API.'
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  throw 'Node.js and npm are required to build and test the API.'
}

$currentTenantId = (& az.cmd account show --query tenantId --output tsv 2>$null)
if ($LASTEXITCODE -ne 0 -or $currentTenantId.Trim() -ne $BankTenantId.ToString()) {
  throw 'Sign in with az login to the bank tenant and select its target subscription before deploying.'
}

$apiDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\apps\api'))
$templatePath = Join-Path $PSScriptRoot 'main.bicep'
$deploymentId = [guid]::NewGuid().ToString('N').Substring(0, 8)
$functionAppName = "$NamePrefix-fn-$deploymentId"
$storageAccountName = "$NamePrefix$deploymentId"
$keyVaultName = "$NamePrefix-kv-$deploymentId"
$apiManagementName = "$NamePrefix-apim-$deploymentId"
$logAnalyticsName = "$NamePrefix-law-$deploymentId"
$applicationInsightsName = "$NamePrefix-ai-$deploymentId"

if ($storageAccountName.Length -gt 24 -or $keyVaultName.Length -gt 24) {
  throw 'Generated storage or Key Vault name exceeds Azure naming limits; use a shorter NamePrefix.'
}

$bankTenantKey = $BankTenantId.ToString().ToLowerInvariant()
$approvedApps = @($ApprovedClientIds | ForEach-Object { $_.ToString().ToLowerInvariant() })
$tenantMap = @{}
$tenantMap[$bankTenantKey] = $approvedApps
$escrowMap = @{}
$escrowMap[$bankTenantKey] = @{
  vaultUrl = "https://$keyVaultName.vault.azure.net/"
  keyName = 'bank-escrow'
  auditSigningKeyName = 'bank-audit-signing'
}

function New-Base64UrlSecret {
  $bytes = New-Object byte[] 48
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  } finally {
    $generator.Dispose()
  }
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Test-CommandSucceeded([string]$Action) {
  if ($LASTEXITCODE -ne 0) {
    throw "$Action failed with exit code $LASTEXITCODE."
  }
}

Push-Location $apiDirectory
$secureParameterFile = Join-Path $env:TEMP "bank-attestation-$deploymentId.parameters.json"
try {
  Write-Host 'Running the API build and tests before creating Azure resources...'
  & npm.cmd test
  Test-CommandSucceeded 'API tests'
  & az.cmd bicep build --file $templatePath --stdout | Out-Null
  Test-CommandSucceeded 'Bicep template compilation'

  $openApiPath = Join-Path $PSScriptRoot 'openapi.json'
  $null = Get-Content -Raw -LiteralPath $openApiPath | ConvertFrom-Json
  $policyPath = Join-Path $PSScriptRoot '..\..\infrastructure\apim-policy.xml'
  $parsedPolicy = [xml](Get-Content -Raw -LiteralPath $policyPath).Replace('__ALLOWED_ORIGIN__', $AllowedOrigin)

  $parameters = @{
    '$schema' = 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#'
    contentVersion = '1.0.0.0'
    parameters = @{
      functionAppName = @{ value = $functionAppName }
      storageAccountName = @{ value = $storageAccountName }
      keyVaultName = @{ value = $keyVaultName }
      apiManagementName = @{ value = $apiManagementName }
      logAnalyticsName = @{ value = $logAnalyticsName }
      applicationInsightsName = @{ value = $applicationInsightsName }
      keyVaultSkuName = @{ value = $KeyVaultSku }
      bankTenantId = @{ value = $bankTenantKey }
      bankTenantsJson = @{ value = ($tenantMap | ConvertTo-Json -Compress -Depth 5) }
      bankEscrowVaultsJson = @{ value = ($escrowMap | ConvertTo-Json -Compress -Depth 5) }
      apiAudience = @{ value = $ApiAudience }
      allowedOrigin = @{ value = $AllowedOrigin }
      relyingPartyId = @{ value = $RelyingPartyId }
      relyingPartyName = @{ value = $RelyingPartyName }
      publisherEmail = @{ value = $PublisherEmail }
      publisherName = @{ value = $PublisherName }
      sessionJwtSecret = @{ value = New-Base64UrlSecret }
      gatewayHeaderSecret = @{ value = New-Base64UrlSecret }
    }
  }
  $parameterJson = $parameters | ConvertTo-Json -Depth 8
  $utf8WithoutBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($secureParameterFile, $parameterJson, $utf8WithoutBom)

  Write-Host "Creating resource group '$ResourceGroupName' in '$Location'..."
  & az.cmd group create --name $ResourceGroupName --location $Location --output none
  Test-CommandSucceeded 'Resource group creation'

  Write-Host 'Previewing the Azure changes. Review the resource list and current regional prices.'
  & az.cmd deployment group what-if `
    --resource-group $ResourceGroupName `
    --name "bank-attestation-$deploymentId" `
    --template-file $templatePath `
    --parameters "@$secureParameterFile" `
    --output table
  Test-CommandSucceeded 'Azure deployment preview'
  $confirmation = Read-Host "Type DEPLOY to create resources in '$ResourceGroupName'"
  if ($confirmation -cne 'DEPLOY') {
    throw 'Deployment cancelled; no billable resources were created.'
  }

  Write-Host 'Deploying the single-bank API, APIM gateway, storage, monitoring, and escrow key...'
  $deploymentJson = & az.cmd deployment group create `
    --resource-group $ResourceGroupName `
    --name "bank-attestation-$deploymentId" `
    --template-file $templatePath `
    --parameters "@$secureParameterFile" `
    --output json
  Test-CommandSucceeded 'Azure infrastructure deployment'
  $deployment = $deploymentJson | ConvertFrom-Json

  $gatewayUrl = $deployment.properties.outputs.apiManagementGatewayUrl.value
  $functionName = $deployment.properties.outputs.functionAppName.value
  if (-not $gatewayUrl -or -not $functionName) {
    throw 'Deployment completed but required gateway outputs were missing.'
  }

  Write-Host 'Publishing the API to the Function App using remote build...'
  & func.cmd azure functionapp publish $functionName --build remote
  Test-CommandSucceeded 'Function App publish'

  Write-Host "Testing the API Management health route at $gatewayUrl/health ..."
  $health = Invoke-RestMethod -Uri "$gatewayUrl/health" -Method Get -TimeoutSec 30
  if ($health.status -ne 'ok') {
    throw 'The gateway health check returned an unexpected response.'
  }

  Write-Host "Deployment completed. API gateway: $gatewayUrl"
  Write-Host 'Keep the Function App and APIM secret settings private; do not copy them into browser code or logs.'
} finally {
  if (Test-Path -LiteralPath $secureParameterFile) {
    Remove-Item -LiteralPath $secureParameterFile -Force
  }
  Pop-Location
}
