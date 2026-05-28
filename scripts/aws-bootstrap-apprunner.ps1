param(
  [string]$Region = $(if($env:AWS_REGION){ $env:AWS_REGION }else{ "ap-southeast-1" }),
  [string]$EcrRepository = $(if($env:ECR_REPOSITORY){ $env:ECR_REPOSITORY }else{ "shop-website" }),
  [string]$ServiceName = $(if($env:APP_RUNNER_SERVICE_NAME){ $env:APP_RUNNER_SERVICE_NAME }else{ "shop-website" }),
  [string]$S3Bucket = $(if($env:AWS_S3_BUCKET){ $env:AWS_S3_BUCKET }else{ "" }),
  [string]$GitHubRepo = "",
  [string]$Branch = "main",
  [string]$GitHubOidcThumbprint = $(if($env:GITHUB_OIDC_THUMBPRINT){ $env:GITHUB_OIDC_THUMBPRINT }else{ "6938fd4d98bab03faadb97b34396831e3780aea1" }),
  [switch]$SkipDockerBuild,
  [switch]$SkipGitHubSecrets
)

$ErrorActionPreference = "Stop"

function Require-Command($Name){
  if(-not (Get-Command $Name -ErrorAction SilentlyContinue)){
    throw "Missing required command: $Name"
  }
}

function Invoke-AwsJson([string[]]$Arguments){
  $output = & aws @Arguments --region $Region --output json
  if($LASTEXITCODE -ne 0){
    throw "AWS command failed: aws $($Arguments -join ' ')"
  }

  if(-not $output){
    return $null
  }

  return ($output | ConvertFrom-Json)
}

function Invoke-AwsText([string[]]$Arguments){
  $output = & aws @Arguments --region $Region --output text
  if($LASTEXITCODE -ne 0){
    throw "AWS command failed: aws $($Arguments -join ' ')"
  }

  return ($output | Out-String).Trim()
}

function Invoke-Native([string]$Command, [string[]]$Arguments){
  & $Command @Arguments
  if($LASTEXITCODE -ne 0){
    throw "Command failed: $Command $($Arguments -join ' ')"
  }
}

function Write-JsonFile($Path, $Value){
  $json = $Value | ConvertTo-Json -Depth 20
  $encoding = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($Path, $json, $encoding)
}

function ConvertTo-S3BucketName($Value){
  $name = ([string]$Value).ToLowerInvariant() -replace "[^a-z0-9-]", "-"
  $name = $name -replace "-+", "-"
  $name = $name.Trim("-")
  if($name.Length -gt 63){
    $name = $name.Substring(0, 63).Trim("-")
  }
  if($name.Length -lt 3){
    throw "Generated S3 bucket name is too short."
  }
  return $name
}

function Trim-Slashes($Value){
  return ([string]$Value).Trim("/")
}

function Has-RealValue($Value){
  $text = ([string]$Value).Trim()
  return $text -and $text -notmatch "^your-" -and $text -notmatch "^<.*>$"
}

function Read-DotEnv($Path){
  $values = @{}
  if(-not (Test-Path -LiteralPath $Path)){
    throw "Missing .env. Copy .env.example to .env and fill production values before bootstrapping AWS."
  }

  foreach($line in Get-Content -LiteralPath $Path){
    $trimmed = $line.Trim()
    if(-not $trimmed -or $trimmed.StartsWith("#")){
      continue
    }

    $parts = $trimmed -split "=", 2
    if($parts.Count -ne 2){
      continue
    }

    $name = $parts[0].Trim()
    $value = $parts[1].Trim()
    if(($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))){
      $value = $value.Substring(1, $value.Length - 2)
    }
    $values[$name] = $value
  }

  return $values
}

function Resolve-GitHubRepo(){
  if($GitHubRepo){
    return $GitHubRepo
  }

  $remote = (& git remote get-url origin)
  if($LASTEXITCODE -ne 0 -or -not $remote){
    throw "Cannot detect GitHub repo. Pass -GitHubRepo owner/repo."
  }

  if($remote -match "github\.com[:/](?<owner>[^/]+)/(?<repo>[^/.]+)(\.git)?$"){
    return "$($Matches.owner)/$($Matches.repo)"
  }

  throw "Cannot parse GitHub remote '$remote'. Pass -GitHubRepo owner/repo."
}

function Ensure-EcrRepository(){
  $repository = $null
  try{
    $repository = Invoke-AwsJson @("ecr", "describe-repositories", "--repository-names", $EcrRepository)
  }catch{
    Invoke-AwsJson @(
      "ecr", "create-repository",
      "--repository-name", $EcrRepository,
      "--image-scanning-configuration", "scanOnPush=true"
    ) | Out-Null
    $repository = Invoke-AwsJson @("ecr", "describe-repositories", "--repository-names", $EcrRepository)
  }

  return $repository.repositories[0]
}

function Ensure-AppRunnerEcrAccessRole(){
  $roleName = "$ServiceName-apprunner-ecr"
  if($roleName.Length -gt 64){
    $roleName = $roleName.Substring(0, 64)
  }

  try{
    return Invoke-AwsText @("iam", "get-role", "--role-name", $roleName, "--query", "Role.Arn")
  }catch{
    $trustPath = Join-Path ([System.IO.Path]::GetTempPath()) "$roleName-trust.json"
    $trustPolicy = @{
      Version = "2012-10-17"
      Statement = @(
        @{
          Effect = "Allow"
          Principal = @{ Service = "build.apprunner.amazonaws.com" }
          Action = "sts:AssumeRole"
        }
      )
    }
    Write-JsonFile $trustPath $trustPolicy

    Invoke-AwsJson @(
      "iam", "create-role",
      "--role-name", $roleName,
      "--assume-role-policy-document", "file://$trustPath"
    ) | Out-Null
    Invoke-AwsJson @(
      "iam", "attach-role-policy",
      "--role-name", $roleName,
      "--policy-arn", "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
    ) | Out-Null

    Start-Sleep -Seconds 10
    return Invoke-AwsText @("iam", "get-role", "--role-name", $roleName, "--query", "Role.Arn")
  }
}

function Ensure-AppRunnerInstanceRole($BucketName, $KeyPrefix){
  $roleName = "$ServiceName-apprunner-runtime"
  if($roleName.Length -gt 64){
    $roleName = $roleName.Substring(0, 64)
  }

  $objectArn = if($KeyPrefix){ "arn:aws:s3:::$BucketName/$KeyPrefix/*" }else{ "arn:aws:s3:::$BucketName/*" }
  $bucketArn = "arn:aws:s3:::$BucketName"
  $trustPath = Join-Path ([System.IO.Path]::GetTempPath()) "$roleName-trust.json"
  $policyPath = Join-Path ([System.IO.Path]::GetTempPath()) "$roleName-policy.json"

  $trustPolicy = @{
    Version = "2012-10-17"
    Statement = @(
      @{
        Effect = "Allow"
        Principal = @{ Service = "tasks.apprunner.amazonaws.com" }
        Action = "sts:AssumeRole"
      }
    )
  }

  $policy = @{
    Version = "2012-10-17"
    Statement = @(
      @{
        Effect = "Allow"
        Action = @("s3:ListBucket")
        Resource = $bucketArn
      },
      @{
        Effect = "Allow"
        Action = @("s3:PutObject", "s3:DeleteObject")
        Resource = $objectArn
      }
    )
  }

  Write-JsonFile $trustPath $trustPolicy
  Write-JsonFile $policyPath $policy

  try{
    $roleArn = Invoke-AwsText @("iam", "get-role", "--role-name", $roleName, "--query", "Role.Arn")
    Invoke-AwsJson @("iam", "update-assume-role-policy", "--role-name", $roleName, "--policy-document", "file://$trustPath") | Out-Null
  }catch{
    Invoke-AwsJson @("iam", "create-role", "--role-name", $roleName, "--assume-role-policy-document", "file://$trustPath") | Out-Null
    Start-Sleep -Seconds 10
    $roleArn = Invoke-AwsText @("iam", "get-role", "--role-name", $roleName, "--query", "Role.Arn")
  }

  Invoke-AwsJson @("iam", "put-role-policy", "--role-name", $roleName, "--policy-name", "$ServiceName-s3-media", "--policy-document", "file://$policyPath") | Out-Null
  return $roleArn
}

function Ensure-S3Bucket($BucketName, $KeyPrefix){
  try{
    Invoke-AwsJson @("s3api", "head-bucket", "--bucket", $BucketName) | Out-Null
  }catch{
    if($Region -eq "us-east-1"){
      Invoke-AwsJson @("s3api", "create-bucket", "--bucket", $BucketName) | Out-Null
    }else{
      Invoke-AwsJson @(
        "s3api", "create-bucket",
        "--bucket", $BucketName,
        "--create-bucket-configuration", "LocationConstraint=$Region"
      ) | Out-Null
    }
  }

  $publicAccessPath = Join-Path ([System.IO.Path]::GetTempPath()) "$BucketName-public-access.json"
  $policyPath = Join-Path ([System.IO.Path]::GetTempPath()) "$BucketName-public-policy.json"
  $publicAccess = @{
    BlockPublicAcls = $false
    IgnorePublicAcls = $false
    BlockPublicPolicy = $false
    RestrictPublicBuckets = $false
  }
  $objectArn = if($KeyPrefix){ "arn:aws:s3:::$BucketName/$KeyPrefix/*" }else{ "arn:aws:s3:::$BucketName/*" }
  $policy = @{
    Version = "2012-10-17"
    Statement = @(
      @{
        Sid = "PublicReadProductImages"
        Effect = "Allow"
        Principal = "*"
        Action = "s3:GetObject"
        Resource = $objectArn
      }
    )
  }

  Write-JsonFile $publicAccessPath $publicAccess
  Write-JsonFile $policyPath $policy

  Invoke-AwsJson @(
    "s3api", "put-public-access-block",
    "--bucket", $BucketName,
    "--public-access-block-configuration", "file://$publicAccessPath"
  ) | Out-Null
  Invoke-AwsJson @("s3api", "put-bucket-policy", "--bucket", $BucketName, "--policy", "file://$policyPath") | Out-Null
}

function Push-InitialImage($Registry, $RepositoryUri){
  if($SkipDockerBuild){
    return
  }

  $password = Invoke-AwsText @("ecr", "get-login-password")
  $password | docker login --username AWS --password-stdin $Registry
  if($LASTEXITCODE -ne 0){
    throw "Docker login to ECR failed."
  }

  Invoke-Native "docker" @("build", "--tag", "$RepositoryUri`:latest", ".")
  Invoke-Native "docker" @("push", "$RepositoryUri`:latest")
}

function Build-SourceConfiguration($AccessRoleArn, $ImageUri, $RuntimeEnv){
  return @{
    AuthenticationConfiguration = @{
      AccessRoleArn = $AccessRoleArn
    }
    AutoDeploymentsEnabled = $false
    ImageRepository = @{
      ImageIdentifier = $ImageUri
      ImageRepositoryType = "ECR"
      ImageConfiguration = @{
        Port = "3000"
        RuntimeEnvironmentVariables = $RuntimeEnv
      }
    }
  }
}

function Build-InstanceConfiguration($InstanceRoleArn){
  return @{
    Cpu = "1024"
    Memory = "2048"
    InstanceRoleArn = $InstanceRoleArn
  }
}

function Ensure-AppRunnerService($AccessRoleArn, $InstanceRoleArn, $ImageUri, $RuntimeEnv){
  $sourcePath = Join-Path ([System.IO.Path]::GetTempPath()) "$ServiceName-source.json"
  $instancePath = Join-Path ([System.IO.Path]::GetTempPath()) "$ServiceName-instance.json"
  $sourceConfig = Build-SourceConfiguration $AccessRoleArn $ImageUri $RuntimeEnv
  $instanceConfig = Build-InstanceConfiguration $InstanceRoleArn
  Write-JsonFile $sourcePath $sourceConfig
  Write-JsonFile $instancePath $instanceConfig

  $services = Invoke-AwsJson @("apprunner", "list-services")
  $service = $services.ServiceSummaryList | Where-Object { $_.ServiceName -eq $ServiceName } | Select-Object -First 1

  if($service){
    Invoke-AwsJson @(
      "apprunner", "update-service",
      "--service-arn", $service.ServiceArn,
      "--source-configuration", "file://$sourcePath",
      "--instance-configuration", "file://$instancePath"
    ) | Out-Null
    return $service.ServiceArn
  }

  $created = Invoke-AwsJson @(
    "apprunner", "create-service",
    "--service-name", $ServiceName,
    "--source-configuration", "file://$sourcePath",
    "--instance-configuration", "file://$instancePath"
  )
  return $created.Service.ServiceArn
}

function Wait-AppRunnerRunning($ServiceArn){
  $service = $null
  for($attempt = 1; $attempt -le 60; $attempt++){
    $description = Invoke-AwsJson @("apprunner", "describe-service", "--service-arn", $ServiceArn)
    $service = $description.Service
    Write-Host "App Runner status: $($service.Status)"

    if($service.Status -eq "RUNNING"){
      return $service
    }

    if($service.Status -match "FAILED|DELETED"){
      throw "App Runner service entered status $($service.Status)."
    }

    Start-Sleep -Seconds 15
  }

  throw "Timed out waiting for App Runner service to become RUNNING."
}

function Ensure-GitHubOidcProvider($AccountId){
  $providerArn = "arn:aws:iam::$AccountId`:oidc-provider/token.actions.githubusercontent.com"
  try{
    Invoke-AwsJson @("iam", "get-open-id-connect-provider", "--open-id-connect-provider-arn", $providerArn) | Out-Null
    return $providerArn
  }catch{
    Invoke-AwsJson @(
      "iam", "create-open-id-connect-provider",
      "--url", "https://token.actions.githubusercontent.com",
      "--client-id-list", "sts.amazonaws.com",
      "--thumbprint-list", $GitHubOidcThumbprint
    ) | Out-Null
    return $providerArn
  }
}

function Ensure-GitHubDeployRole($AccountId, $ProviderArn, $RepositoryArn, $ServiceArn, $RepositoryName){
  $roleName = "$ServiceName-github-deploy"
  if($roleName.Length -gt 64){
    $roleName = $roleName.Substring(0, 64)
  }

  $trustPath = Join-Path ([System.IO.Path]::GetTempPath()) "$roleName-trust.json"
  $policyPath = Join-Path ([System.IO.Path]::GetTempPath()) "$roleName-policy.json"
  $sub = "repo:$RepositoryName`:ref:refs/heads/$Branch"

  $trustPolicy = @{
    Version = "2012-10-17"
    Statement = @(
      @{
        Effect = "Allow"
        Principal = @{ Federated = $ProviderArn }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = @{
          StringEquals = @{
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
            "token.actions.githubusercontent.com:sub" = $sub
          }
        }
      }
    )
  }

  $deployPolicy = @{
    Version = "2012-10-17"
    Statement = @(
      @{
        Effect = "Allow"
        Action = @("ecr:GetAuthorizationToken")
        Resource = "*"
      },
      @{
        Effect = "Allow"
        Action = @("ecr:CreateRepository")
        Resource = "*"
      },
      @{
        Effect = "Allow"
        Action = @(
          "ecr:DescribeRepositories",
          "ecr:BatchCheckLayerAvailability",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage"
        )
        Resource = $RepositoryArn
      },
      @{
        Effect = "Allow"
        Action = @("apprunner:StartDeployment")
        Resource = $ServiceArn
      }
    )
  }

  Write-JsonFile $trustPath $trustPolicy
  Write-JsonFile $policyPath $deployPolicy

  try{
    $roleArn = Invoke-AwsText @("iam", "get-role", "--role-name", $roleName, "--query", "Role.Arn")
    Invoke-AwsJson @("iam", "update-assume-role-policy", "--role-name", $roleName, "--policy-document", "file://$trustPath") | Out-Null
  }catch{
    Invoke-AwsJson @("iam", "create-role", "--role-name", $roleName, "--assume-role-policy-document", "file://$trustPath") | Out-Null
    $roleArn = Invoke-AwsText @("iam", "get-role", "--role-name", $roleName, "--query", "Role.Arn")
  }

  Invoke-AwsJson @("iam", "put-role-policy", "--role-name", $roleName, "--policy-name", "$ServiceName-deploy", "--policy-document", "file://$policyPath") | Out-Null
  return $roleArn
}

function Set-GitHubConfiguration($RepositoryName, $DeployRoleArn, $ServiceArn){
  if($SkipGitHubSecrets){
    return
  }

  Invoke-Native "gh" @("secret", "set", "AWS_ROLE_TO_ASSUME", "--body", $DeployRoleArn, "--repo", $RepositoryName)
  Invoke-Native "gh" @("secret", "set", "APP_RUNNER_SERVICE_ARN", "--body", $ServiceArn, "--repo", $RepositoryName)
  Invoke-Native "gh" @("variable", "set", "AWS_REGION", "--body", $Region, "--repo", $RepositoryName)
  Invoke-Native "gh" @("variable", "set", "ECR_REPOSITORY", "--body", $EcrRepository, "--repo", $RepositoryName)
}

Require-Command "aws"
Require-Command "git"
Require-Command "docker"
if(-not $SkipGitHubSecrets){
  Require-Command "gh"
}

$repositoryName = Resolve-GitHubRepo
$runtimeEnv = Read-DotEnv (Join-Path (Get-Location) ".env")
$requiredEnv = @(
  "MONGODB_URI",
  "JWT_SECRET",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD"
)

foreach($name in $requiredEnv){
  if(-not $runtimeEnv.ContainsKey($name) -or -not $runtimeEnv[$name]){
    throw "Missing required .env value: $name"
  }
}

$allowedRuntimeEnv = @(
  "NODE_ENV",
  "MONGODB_URI",
  "JWT_SECRET",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD",
  "AWS_REGION",
  "AWS_S3_BUCKET",
  "AWS_S3_KEY_PREFIX",
  "AWS_S3_PUBLIC_BASE_URL",
  "CORS_ORIGIN"
)

$appRunnerEnv = @{}
foreach($name in $allowedRuntimeEnv){
  if($runtimeEnv.ContainsKey($name) -and $runtimeEnv[$name]){
    $appRunnerEnv[$name] = $runtimeEnv[$name]
  }
}
$appRunnerEnv["NODE_ENV"] = "production"

$identity = Invoke-AwsJson @("sts", "get-caller-identity")
$accountId = $identity.Account
$registry = "$accountId.dkr.ecr.$Region.amazonaws.com"
$keyPrefix = if($runtimeEnv.ContainsKey("AWS_S3_KEY_PREFIX") -and $runtimeEnv["AWS_S3_KEY_PREFIX"]){
  Trim-Slashes $runtimeEnv["AWS_S3_KEY_PREFIX"]
}else{
  "shop-website/products"
}
$s3BucketName = if(Has-RealValue $S3Bucket){
  ConvertTo-S3BucketName $S3Bucket
}elseif($runtimeEnv.ContainsKey("AWS_S3_BUCKET") -and (Has-RealValue $runtimeEnv["AWS_S3_BUCKET"])){
  ConvertTo-S3BucketName $runtimeEnv["AWS_S3_BUCKET"]
}else{
  ConvertTo-S3BucketName "$ServiceName-$accountId-$Region-assets"
}

$appRunnerEnv["AWS_REGION"] = $Region
$appRunnerEnv["AWS_S3_BUCKET"] = $s3BucketName
$appRunnerEnv["AWS_S3_KEY_PREFIX"] = $keyPrefix

Write-Host "AWS account: $accountId"
Write-Host "GitHub repo: $repositoryName"
Write-Host "Region: $Region"
Write-Host "S3 bucket: $s3BucketName"

$repository = Ensure-EcrRepository
$repositoryUri = $repository.repositoryUri
$repositoryArn = $repository.repositoryArn

Ensure-S3Bucket $s3BucketName $keyPrefix

Push-InitialImage $registry $repositoryUri

$accessRoleArn = Ensure-AppRunnerEcrAccessRole
$instanceRoleArn = Ensure-AppRunnerInstanceRole $s3BucketName $keyPrefix
$serviceArn = Ensure-AppRunnerService $accessRoleArn $instanceRoleArn "$repositoryUri`:latest" $appRunnerEnv
$service = Wait-AppRunnerRunning $serviceArn

$providerArn = Ensure-GitHubOidcProvider $accountId
$deployRoleArn = Ensure-GitHubDeployRole $accountId $providerArn $repositoryArn $serviceArn $repositoryName
Set-GitHubConfiguration $repositoryName $deployRoleArn $serviceArn

Write-Host ""
Write-Host "AWS bootstrap complete."
Write-Host "App Runner URL: https://$($service.ServiceUrl)"
Write-Host "ECR image: $repositoryUri`:latest"
Write-Host "S3 bucket: $s3BucketName"
Write-Host "GitHub deploy role: $deployRoleArn"
