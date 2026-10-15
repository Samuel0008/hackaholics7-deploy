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
  [string]$SecurityContactEmail,
  [string]$PublisherEmail,
  [string]$PublisherName,
  [ValidateSet('standard', 'premium')]
  [string]$KeyVaultSku = 'standard',
  [switch]$PreviewOnly,
  [switch]$FunctionOnly,
  [switch]$Deploy
)

$ErrorActionPreference = 'Stop'

if (-not $Deploy -and -not $PreviewOnly) {
  throw 'No cloud resources were created. Use -PreviewOnly to review the Azure changes, or -Deploy after reviewing the cost and deployment notes.'
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
if (-not $FunctionOnly -and $PublisherEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
  throw 'PublisherEmail must be a valid email address.'
}
if (-not $FunctionOnly -and [string]::IsNullOrWhiteSpace($PublisherName)) {
  throw 'PublisherName is required when API Management is enabled.'
}
if ($SecurityContactEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
  throw 'SecurityContactEmail must be the monitored security operations mailbox.'
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
$bootstrapParameterFile = Join-Path $env:TEMP "bank-attestation-$deploymentId-bootstrap.parameters.json"
try {
  Write-Host 'Running the API build and tests before creating Azure resources...'
  & npm.cmd test
  Test-CommandSucceeded 'API tests'
  & az.cmd bicep build --file $templatePath --stdout | Out-Null
  Test-CommandSucceeded 'Bicep template compilation'

  if (-not $FunctionOnly) {
    $openApiPath = Join-Path $PSScriptRoot 'openapi.json'
    $null = Get-Content -Raw -LiteralPath $openApiPath | ConvertFrom-Json
    $policyPath = Join-Path $PSScriptRoot '..\..\infrastructure\apim-policy.xml'
    $parsedPolicy = [xml](Get-Content -Raw -LiteralPath $policyPath).Replace('__ALLOWED_ORIGIN__', $AllowedOrigin)
  }

  $effectivePublisherEmail = if ($FunctionOnly) { 'prototype@example.invalid' } else { $PublisherEmail }
  $effectivePublisherName = if ($FunctionOnly) { 'Prototype API' } else { $PublisherName }
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
      deployApiManagement = @{ value = -not $FunctionOnly }
      restrictFunctionIngress = @{ value = $true }
      keyVaultSkuName = @{ value = $KeyVaultSku }
      bankTenantId = @{ value = $bankTenantKey }
      bankTenantsJson = @{ value = ($tenantMap | ConvertTo-Json -Compress -Depth 5) }
      bankEscrowVaultsJson = @{ value = ($escrowMap | ConvertTo-Json -Compress -Depth 5) }
      apiAudience = @{ value = $ApiAudience }
      allowedOrigin = @{ value = $AllowedOrigin }
      relyingPartyId = @{ value = $RelyingPartyId }
      relyingPartyName = @{ value = $RelyingPartyName }
      securityContactEmail = @{ value = $SecurityContactEmail }
      publisherEmail = @{ value = $effectivePublisherEmail }
      publisherName = @{ value = $effectivePublisherName }
      sessionJwtSecret = @{ value = New-Base64UrlSecret }
      gatewayHeaderSecret = @{ value = New-Base64UrlSecret }
    }
  }
  $parameterJson = $parameters | ConvertTo-Json -Depth 8
  $utf8WithoutBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($secureParameterFile, $parameterJson, $utf8WithoutBom)
  $parameters.parameters.restrictFunctionIngress.value = $false
  $bootstrapParameterJson = $parameters | ConvertTo-Json -Depth 8
  [System.IO.File]::WriteAllText($bootstrapParameterFile, $bootstrapParameterJson, $utf8WithoutBom)
  $parameters.parameters.restrictFunctionIngress.value = $true

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
  if ($PreviewOnly) {
    Write-Host 'Preview complete. No billable resources were deployed.'
    return
  }
  $confirmation = Read-Host "Type DEPLOY to create resources in '$ResourceGroupName'"
  if ($confirmation -cne 'DEPLOY') {
    throw 'Deployment cancelled; no billable resources were created.'
  }

  if ($FunctionOnly) {
    Write-Host 'Deploying Azure Functions, Storage, Key Vault, and monitoring without API Management...'
  } else {
    Write-Host 'Creating the API and Azure dependencies behind the gateway header...'
  }
  $deploymentJson = & az.cmd deployment group create `
    --resource-group $ResourceGroupName `
      --name "bank-attestation-$deploymentId-bootstrap" `
    --template-file $templatePath `
      --parameters "@$bootstrapParameterFile" `
    --output json
    Test-CommandSucceeded 'Initial Azure infrastructure deployment'
  $deployment = $deploymentJson | ConvertFrom-Json

    $functionUrl = $deployment.properties.outputs.functionAppUrl.value
    $functionName = $deployment.properties.outputs.functionAppName.value
    if (-not $functionUrl -or -not $functionName) {
      throw 'Initial deployment completed but required Function App outputs were missing.'
  }

    Write-Host 'Publishing the API before closing direct Function and SCM ingress...'
    & func.cmd azure functionapp publish $functionName --build remote
    Test-CommandSucceeded 'Function App publish'

    if (-not $FunctionOnly) {
      Write-Host 'Applying the final API-Management-only Function ingress restriction...'
      $deploymentJson = & az.cmd deployment group create `
        --resource-group $ResourceGroupName `
        --name "bank-attestation-$deploymentId-locked-down" `
        --template-file $templatePath `
        --parameters "@$secureParameterFile" `
        --output json
      Test-CommandSucceeded 'Final Function ingress restriction deployment'
      $deployment = $deploymentJson | ConvertFrom-Json
    }

    $gatewayUrl = if ($FunctionOnly) {
      $deployment.properties.outputs.functionAppUrl.value
    } else {
      $deployment.properties.outputs.apiManagementGatewayUrl.value
    }
    if (-not $gatewayUrl -or -not $functionName) {
      throw 'Deployment completed but required gateway outputs were missing.'
    }

    Write-Host "Testing the Function API health route at $gatewayUrl/health ..."
  $health = Invoke-RestMethod -Uri "$gatewayUrl/health" -Method Get -TimeoutSec 30
  if ($health.status -ne 'ok') {
    throw 'The gateway health check returned an unexpected response.'
  }

  if ($FunctionOnly) {
    Write-Host "Deployment completed. Function API base URL: $gatewayUrl"
    Write-Warning 'This direct Function endpoint has no API Management rate limiting or gateway body-size policy. Add a trusted gateway and abuse controls before exposing it broadly.'
  } else {
    Write-Host "Deployment completed. API gateway: $gatewayUrl"
    Write-Host 'Keep the Function App and APIM secret settings private; do not copy them into browser code or logs.'
  }
} finally {
  if (Test-Path -LiteralPath $secureParameterFile) {
    Remove-Item -LiteralPath $secureParameterFile -Force
  }
  if (Test-Path -LiteralPath $bootstrapParameterFile) {
    Remove-Item -LiteralPath $bootstrapParameterFile -Force
  }
  Pop-Location
}
