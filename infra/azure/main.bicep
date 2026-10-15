@description('Globally unique lowercase name for the Function App.')
param functionAppName string

@description('Globally unique lowercase name for the Storage Account (3-24 characters).')
param storageAccountName string

@description('Globally unique name for the Azure Key Vault.')
param keyVaultName string

@description('Globally unique name for API Management.')
param apiManagementName string

@description('Name of the Log Analytics workspace.')
param logAnalyticsName string

@description('Name of the Application Insights component.')
param applicationInsightsName string

@description('Deploy API Management in front of the Function App.')
param deployApiManagement bool = true

@description('Restrict Function App and deployment endpoint ingress to API Management after the API is published.')
param restrictFunctionIngress bool = true

@allowed([
  'standard'
  'premium'
])
@description('Use premium for Key Vault HSM-backed keys when required by the bank.')
param keyVaultSkuName string = 'standard'

@description('Entra tenant GUID for this single-bank deployment.')
param bankTenantId string

@description('JSON object mapping this bank tenant GUID to approved caller app client GUIDs.')
param bankTenantsJson string

@description('JSON object mapping the bank tenant GUID to this deployment Key Vault and escrow key.')
param bankEscrowVaultsJson string

@description('Audience identifier of the API app registration.')
param apiAudience string

@description('Exact trusted frontend origin.')
param allowedOrigin string

@description('WebAuthn relying-party hostname.')
param relyingPartyId string

@description('WebAuthn relying-party display name.')
param relyingPartyName string

@description('At least 32 random bytes encoded as a string; never output or commit this value.')
@secure()
param sessionJwtSecret string

@description('At least 32 random bytes encoded as a string; shared only by APIM and the Function App.')
@secure()
param gatewayHeaderSecret string

@description('APIM publisher contact email.')
param publisherEmail string

@description('APIM publisher display name.')
param publisherName string

@description('Security operations mailbox for actionable API failure alerts.')
param securityContactEmail string

var tablesRoleId = '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'
var blobsRoleId = 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'
var queuesRoleId = '974c5e8b-45b9-4653-ba55-5f855dd0fb88'
var storageAccountContributorRoleId = '17d1049b-9a84-46fb-8f53-869881c3d3ab'
var keyVaultCryptoUserRoleId = '12338af0-0e69-4776-bea7-57ae8d297424'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: resourceGroup().location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_GRS'
  }
  properties: {
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Enabled'
  }
}

resource workspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsName
  location: resourceGroup().location
  properties: {
    retentionInDays: 30
    sku: {
      name: 'PerGB2018'
    }
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: applicationInsightsName
  location: resourceGroup().location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
    IngestionMode: 'LogAnalytics'
  }
}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${functionAppName}-plan'
  location: resourceGroup().location
  kind: 'linux'
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: {
    reserved: true
  }
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: resourceGroup().location
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|22'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      http20Enabled: true
      cors: {
        allowedOrigins: [
          allowedOrigin
        ]
        supportCredentials: false
      }
      ipSecurityRestrictions: restrictFunctionIngress && deployApiManagement ? [
        {
          name: 'Allow API Management gateway only'
          priority: 100
          action: 'Allow'
          ipAddress: 'ApiManagement'
          tag: 'ServiceTag'
        }
      ] : []
      ipSecurityRestrictionsDefaultAction: restrictFunctionIngress && deployApiManagement
        ? 'Deny'
        : 'Allow'
      scmIpSecurityRestrictionsUseMain: restrictFunctionIngress && deployApiManagement
    }
    publicNetworkAccess: 'Enabled'
  }
}

resource functionAppSettings 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: functionApp
  name: 'appsettings'
  properties: union({
    FUNCTIONS_EXTENSION_VERSION: '~4'
    FUNCTIONS_WORKER_RUNTIME: 'node'
    WEBSITE_NODE_DEFAULT_VERSION: '~22'
    AzureWebJobsStorage__accountName: storage.name
    AzureWebJobsStorage__credential: 'managedidentity'
    TABLES_ENDPOINT: 'https://${storage.name}.table.core.windows.net'
    APPLICATIONINSIGHTS_CONNECTION_STRING: insights.properties.ConnectionString
    AZURE_API_AUDIENCE: apiAudience
    BANK_TENANTS_JSON: bankTenantsJson
    DECOY_TENANT_ID: bankTenantId
    BANK_ESCROW_VAULTS_JSON: bankEscrowVaultsJson
    JWT_SECRET: sessionJwtSecret
    RP_ID: relyingPartyId
    RP_NAME: relyingPartyName
    EXPECTED_ORIGIN: allowedOrigin
    ALLOWED_ORIGIN: allowedOrigin
  }, deployApiManagement ? {
    GATEWAY_SHARED_SECRET: gatewayHeaderSecret
  } : {})
}

resource storageTableAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, functionAppName, tablesRoleId)
  scope: storage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', tablesRoleId)
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource storageBlobAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, functionAppName, blobsRoleId)
  scope: storage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobsRoleId)
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource storageQueueAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, functionAppName, queuesRoleId)
  scope: storage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', queuesRoleId)
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource storageAccountAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, functionAppName, storageAccountContributorRoleId)
  scope: storage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageAccountContributorRoleId)
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: resourceGroup().location
  properties: {
    sku: {
      family: 'A'
      name: keyVaultSkuName
    }
    enableRbacAuthorization: true
    enablePurgeProtection: true
    tenantId: bankTenantId
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
  }
}

resource escrowKey 'Microsoft.KeyVault/vaults/keys@2024-11-01' = {
  parent: vault
  name: 'bank-escrow'
  properties: {
    kty: keyVaultSkuName == 'premium' ? 'RSA-HSM' : 'RSA'
    keySize: 3072
    keyOps: [
      'encrypt'
      'decrypt'
    ]
    attributes: {
      enabled: true
    }
    rotationPolicy: {
      lifetimeActions: [
        {
          trigger: {
            timeAfterCreate: 'P18M'
            timeBeforeExpiry: ''
          }
          action: {
            type: 'rotate'
          }
        }
        {
          trigger: {
            timeBeforeExpiry: 'P30D'
          }
          action: {
            type: 'notify'
          }
        }
      ]
      attributes: {
        expiryTime: 'P2Y'
      }
    }
  }
}

resource auditSigningKey 'Microsoft.KeyVault/vaults/keys@2024-11-01' = {
  parent: vault
  name: 'bank-audit-signing'
  properties: {
    kty: keyVaultSkuName == 'premium' ? 'RSA-HSM' : 'RSA'
    keySize: 3072
    keyOps: [
      'sign'
      'verify'
    ]
    attributes: {
      enabled: true
    }
    rotationPolicy: {
      lifetimeActions: [
        {
          trigger: {
            timeAfterCreate: 'P18M'
            timeBeforeExpiry: ''
          }
          action: {
            type: 'rotate'
          }
        }
        {
          trigger: {
            timeBeforeExpiry: 'P30D'
          }
          action: {
            type: 'notify'
          }
        }
      ]
      attributes: {
        expiryTime: 'P2Y'
      }
    }
  }
}

resource vaultCryptoAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, functionAppName, keyVaultCryptoUserRoleId)
  scope: vault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultCryptoUserRoleId)
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource apiManagement 'Microsoft.ApiManagement/service@2022-08-01' = if (deployApiManagement) {
  name: apiManagementName
  location: resourceGroup().location
  sku: {
    name: 'Basic'
    capacity: 1
  }
  properties: {
    publisherEmail: publisherEmail
    publisherName: publisherName
  }
}

resource securityActionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: '${applicationInsightsName}-secops'
  location: 'global'
  properties: {
    groupShortName: 'BankSecOps'
    enabled: true
    emailReceivers: [
      {
        name: 'Bank Security Operations'
        emailAddress: securityContactEmail
        useCommonAlertSchema: true
      }
    ]
  }
}

resource functionDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'function-to-log-analytics'
  scope: functionApp
  properties: {
    workspaceId: workspace.id
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

resource keyVaultDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'key-vault-to-log-analytics'
  scope: vault
  properties: {
    workspaceId: workspace.id
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

resource apiManagementDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (deployApiManagement) {
  name: 'api-management-to-log-analytics'
  scope: apiManagement
  properties: {
    workspaceId: workspace.id
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

resource functionFailureAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: '${applicationInsightsName}-function-5xx'
  location: 'global'
  properties: {
    description: 'Alerts when the Banking Attestation Function returns repeated server errors.'
    severity: 2
    enabled: true
    scopes: [
      functionApp.id
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    targetResourceType: 'Microsoft.Web/sites'
    targetResourceRegion: resourceGroup().location
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          name: 'Function HTTP 5xx'
          metricNamespace: 'Microsoft.Web/sites'
          metricName: 'Http5xx'
          timeAggregation: 'Total'
          operator: 'GreaterThan'
          threshold: 5
          skipMetricValidation: true
        }
      ]
    }
    actions: [
      {
        actionGroupId: securityActionGroup.id
      }
    ]
  }
}

resource identifiedDecoyAlert 'Microsoft.Insights/scheduledQueryRules@2023-12-01' = {
  name: '${applicationInsightsName}-identified-decoys'
  location: resourceGroup().location
  kind: 'LogAlert'
  properties: {
    displayName: 'Banking API identified decoy activity'
    description: 'Notifies security operations when a verified identity triggers a decoy containment event.'
    severity: 1
    enabled: true
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    scopes: [
      workspace.id
    ]
    criteria: {
      allOf: [
        {
          query: '''
AppTraces
| where TimeGenerated >= ago(5m)
| where Message startswith "Account suspended pending investigation"
    or Message startswith "Existing sessions invalidated after verified identity accessed decoy"
| summarize SecurityEvents = count()
'''
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
        }
      ]
    }
    actions: {
      actionGroups: [
        securityActionGroup.id
      ]
    }
  }
  dependsOn: [
    functionApp
    functionDiagnostics
  ]
}

resource gatewayNamedValue 'Microsoft.ApiManagement/service/namedValues@2022-08-01' = if (deployApiManagement) {
  parent: apiManagement
  name: 'function-backend-key'
  properties: {
    displayName: 'Function backend gateway key'
    value: gatewayHeaderSecret
    secret: true
  }
}

resource api 'Microsoft.ApiManagement/service/apis@2022-08-01' = if (deployApiManagement) {
  parent: apiManagement
  name: 'banking-api'
  properties: {
    displayName: 'Banking Attestation API'
    path: 'v1'
    protocols: [
      'https'
    ]
    serviceUrl: 'https://${functionApp.properties.defaultHostName}/api'
    subscriptionRequired: false
    format: 'openapi+json'
    value: loadTextContent('./openapi.json')
  }
  dependsOn: [
    functionAppSettings
    gatewayNamedValue
  ]
}

resource apiPolicy 'Microsoft.ApiManagement/service/apis/policies@2022-08-01' = if (deployApiManagement) {
  parent: api
  name: 'policy'
  properties: {
    format: 'rawxml'
    value: replace(loadTextContent('../../infrastructure/apim-policy.xml'), '__ALLOWED_ORIGIN__', allowedOrigin)
  }
  dependsOn: [
    gatewayNamedValue
  ]
}

output functionAppName string = functionApp.name
output functionAppUrl string = 'https://${functionApp.properties.defaultHostName}/api'
output apiManagementGatewayUrl string = deployApiManagement
  ? 'https://${apiManagement!.name}.azure-api.net/v1'
  : ''
output storageAccountName string = storage.name
output keyVaultUri string = vault.properties.vaultUri
output escrowKeyName string = escrowKey.name
output bankTenantId string = bankTenantId
