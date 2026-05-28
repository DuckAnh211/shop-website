param(
  [string]$Region = $(if($env:AWS_REGION){ $env:AWS_REGION }else{ "ap-southeast-1" }),
  [string]$EcrRepository = $(if($env:ECR_REPOSITORY){ $env:ECR_REPOSITORY }else{ "shop-website" }),
  [string]$ServiceName = $(if($env:EC2_SERVICE_NAME){ $env:EC2_SERVICE_NAME }else{ "shop-website" }),
  [string]$S3Bucket = $(if($env:AWS_S3_BUCKET){ $env:AWS_S3_BUCKET }else{ "" }),
  [string]$GitHubRepo = "",
  [string]$Branch = "main",
  [string]$InstanceType = $(if($env:EC2_INSTANCE_TYPE){ $env:EC2_INSTANCE_TYPE }else{ "t3.micro" }),
  [string]$VpcId = $(if($env:EC2_VPC_ID){ $env:EC2_VPC_ID }else{ "" }),
  [string]$SubnetId = $(if($env:EC2_SUBNET_ID){ $env:EC2_SUBNET_ID }else{ "" }),
  [string]$AmiId = $(if($env:EC2_AMI_ID){ $env:EC2_AMI_ID }else{ "" }),
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
  $json = $Value | ConvertTo-Json -Depth 30
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
  return $text -and $text -notmatch "^your-" -and $text -notmatch "^replace-with" -and $text -notmatch "<[^>]+>"
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

function ConvertTo-EnvFileBase64($Values){
  $lines = @()
  foreach($name in ($Values.Keys | Sort-Object)){
    $lines += "$name=$($Values[$name])"
  }

  $content = ($lines -join "`n") + "`n"
  return [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($content))
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

function Ensure-Ec2InstanceProfile($RepositoryArn, $BucketName, $KeyPrefix){
  $roleName = "$ServiceName-ec2-runtime"
  $profileName = "$ServiceName-ec2-profile"
  if($roleName.Length -gt 64){
    $roleName = $roleName.Substring(0, 64)
  }
  if($profileName.Length -gt 128){
    $profileName = $profileName.Substring(0, 128)
  }

  $trustPath = Join-Path ([System.IO.Path]::GetTempPath()) "$roleName-trust.json"
  $policyPath = Join-Path ([System.IO.Path]::GetTempPath()) "$roleName-policy.json"
  $bucketArn = "arn:aws:s3:::$BucketName"
  $objectArn = if($KeyPrefix){ "arn:aws:s3:::$BucketName/$KeyPrefix/*" }else{ "arn:aws:s3:::$BucketName/*" }
  $trustPolicy = @{
    Version = "2012-10-17"
    Statement = @(
      @{
        Effect = "Allow"
        Principal = @{ Service = "ec2.amazonaws.com" }
        Action = "sts:AssumeRole"
      }
    )
  }
  $policy = @{
    Version = "2012-10-17"
    Statement = @(
      @{
        Effect = "Allow"
        Action = @("ecr:GetAuthorizationToken")
        Resource = "*"
      },
      @{
        Effect = "Allow"
        Action = @("ecr:BatchGetImage", "ecr:BatchCheckLayerAvailability", "ecr:GetDownloadUrlForLayer")
        Resource = $RepositoryArn
      },
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
    Invoke-AwsText @("iam", "get-role", "--role-name", $roleName, "--query", "Role.Arn") | Out-Null
    Invoke-AwsJson @("iam", "update-assume-role-policy", "--role-name", $roleName, "--policy-document", "file://$trustPath") | Out-Null
  }catch{
    Invoke-AwsJson @("iam", "create-role", "--role-name", $roleName, "--assume-role-policy-document", "file://$trustPath") | Out-Null
  }

  Invoke-AwsJson @("iam", "attach-role-policy", "--role-name", $roleName, "--policy-arn", "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore") | Out-Null
  Invoke-AwsJson @("iam", "put-role-policy", "--role-name", $roleName, "--policy-name", "$ServiceName-ec2-runtime", "--policy-document", "file://$policyPath") | Out-Null

  try{
    $profile = Invoke-AwsJson @("iam", "get-instance-profile", "--instance-profile-name", $profileName)
  }catch{
    Invoke-AwsJson @("iam", "create-instance-profile", "--instance-profile-name", $profileName) | Out-Null
    $profile = Invoke-AwsJson @("iam", "get-instance-profile", "--instance-profile-name", $profileName)
  }

  $hasRole = $false
  foreach($role in $profile.InstanceProfile.Roles){
    if($role.RoleName -eq $roleName){
      $hasRole = $true
    }
  }

  if(-not $hasRole){
    Invoke-AwsJson @("iam", "add-role-to-instance-profile", "--instance-profile-name", $profileName, "--role-name", $roleName) | Out-Null
    Start-Sleep -Seconds 10
  }

  return $profileName
}

function Resolve-VpcId(){
  if($VpcId){
    return $VpcId
  }

  $resolved = Invoke-AwsText @(
    "ec2", "describe-vpcs",
    "--filters", "Name=isDefault,Values=true",
    "--query", "Vpcs[0].VpcId"
  )

  if(-not $resolved -or $resolved -eq "None"){
    throw "No default VPC found. Pass -VpcId and -SubnetId."
  }

  return $resolved
}

function Resolve-SubnetId($ResolvedVpcId){
  if($SubnetId){
    return $SubnetId
  }

  $resolved = Invoke-AwsText @(
    "ec2", "describe-subnets",
    "--filters", "Name=vpc-id,Values=$ResolvedVpcId", "Name=default-for-az,Values=true",
    "--query", "Subnets[0].SubnetId"
  )

  if(-not $resolved -or $resolved -eq "None"){
    $resolved = Invoke-AwsText @(
      "ec2", "describe-subnets",
      "--filters", "Name=vpc-id,Values=$ResolvedVpcId",
      "--query", "Subnets[0].SubnetId"
    )
  }

  if(-not $resolved -or $resolved -eq "None"){
    throw "No subnet found in VPC $ResolvedVpcId. Pass -SubnetId."
  }

  return $resolved
}

function Ensure-SecurityGroup($ResolvedVpcId){
  $groupName = "$ServiceName-web"
  $groupId = Invoke-AwsText @(
    "ec2", "describe-security-groups",
    "--filters", "Name=group-name,Values=$groupName", "Name=vpc-id,Values=$ResolvedVpcId",
    "--query", "SecurityGroups[0].GroupId"
  )

  if(-not $groupId -or $groupId -eq "None"){
    $groupId = Invoke-AwsText @(
      "ec2", "create-security-group",
      "--group-name", $groupName,
      "--description", "Public HTTP access for $ServiceName",
      "--vpc-id", $ResolvedVpcId,
      "--query", "GroupId"
    )
  }

  try{
    Invoke-AwsJson @(
      "ec2", "authorize-security-group-ingress",
      "--group-id", $groupId,
      "--ip-permissions", "IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0,Description=HTTP}]"
    ) | Out-Null
  }catch{
  }

  return $groupId
}

function Resolve-AmiId(){
  if($AmiId){
    return $AmiId
  }

  return Invoke-AwsText @(
    "ssm", "get-parameter",
    "--name", "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64",
    "--query", "Parameter.Value"
  )
}

function Build-UserData($EnvBase64, $Registry, $RepositoryUri){
  return @"
#!/bin/bash
set -euo pipefail
dnf update -y
dnf install -y docker
if ! command -v aws >/dev/null 2>&1; then
  dnf install -y unzip
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
  unzip -q /tmp/awscliv2.zip -d /tmp
  /tmp/aws/install
fi
if ! systemctl list-unit-files amazon-ssm-agent.service >/dev/null 2>&1; then
  dnf install -y amazon-ssm-agent || true
fi
systemctl enable --now docker
systemctl enable --now amazon-ssm-agent || true
mkdir -p /opt/shop-website
cat > /tmp/shop-website.env.b64 <<'ENVEOF'
$EnvBase64
ENVEOF
base64 -d /tmp/shop-website.env.b64 > /opt/shop-website/.env
chmod 600 /opt/shop-website/.env
aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin $Registry
docker pull $RepositoryUri`:latest
docker stop shop-website || true
docker rm shop-website || true
docker run -d --name shop-website --restart unless-stopped --env-file /opt/shop-website/.env -p 80:3000 $RepositoryUri`:latest
docker image prune -f
"@
}

function Find-ExistingInstance(){
  $instanceId = Invoke-AwsText @(
    "ec2", "describe-instances",
    "--filters", "Name=tag:Name,Values=$ServiceName-ec2", "Name=instance-state-name,Values=pending,running,stopping,stopped",
    "--query", "Reservations[0].Instances[0].InstanceId"
  )

  if($instanceId -and $instanceId -ne "None"){
    return $instanceId
  }

  return ""
}

function Ensure-Ec2Instance($ProfileName, $SecurityGroupId, $ResolvedSubnetId, $ResolvedAmiId, $EnvBase64, $Registry, $RepositoryUri){
  $instanceId = Find-ExistingInstance

  if($instanceId){
    $state = Invoke-AwsText @("ec2", "describe-instances", "--instance-ids", $instanceId, "--query", "Reservations[0].Instances[0].State.Name")
    if($state -eq "stopped"){
      Invoke-AwsJson @("ec2", "start-instances", "--instance-ids", $instanceId) | Out-Null
    }
    return $instanceId
  }

  $userDataPath = Join-Path ([System.IO.Path]::GetTempPath()) "$ServiceName-user-data.sh"
  $networkInterface = "DeviceIndex=0,SubnetId=$ResolvedSubnetId,Groups=[$SecurityGroupId],AssociatePublicIpAddress=true"

  $userData = Build-UserData $EnvBase64 $Registry $RepositoryUri
  $encoding = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($userDataPath, $userData, $encoding)

  $created = Invoke-AwsJson @(
    "ec2", "run-instances",
    "--image-id", $ResolvedAmiId,
    "--instance-type", $InstanceType,
    "--iam-instance-profile", "Name=$ProfileName",
    "--network-interfaces", $networkInterface,
    "--user-data", "file://$userDataPath",
    "--tag-specifications", "ResourceType=instance,Tags=[{Key=Name,Value=$ServiceName-ec2},{Key=Service,Value=$ServiceName}]"
  )

  return $created.Instances[0].InstanceId
}

function Wait-InstanceRunning($InstanceId){
  Invoke-Native "aws" @("ec2", "wait", "instance-running", "--instance-ids", $InstanceId, "--region", $Region)
}

function Wait-SsmOnline($InstanceId){
  for($attempt = 1; $attempt -le 60; $attempt++){
    $status = Invoke-AwsText @(
      "ssm", "describe-instance-information",
      "--filters", "Key=InstanceIds,Values=$InstanceId",
      "--query", "InstanceInformationList[0].PingStatus"
    )
    Write-Host "SSM status: $status"

    if($status -eq "Online"){
      return
    }

    Start-Sleep -Seconds 10
  }

  throw "Timed out waiting for EC2 instance $InstanceId to appear online in SSM."
}

function Invoke-Ec2Deploy($InstanceId, $EnvBase64, $Registry, $ImageUri){
  $commandsPath = Join-Path ([System.IO.Path]::GetTempPath()) "$ServiceName-ssm-deploy.json"
  $commands = @{
    commands = @(
      "set -e",
      "if ! command -v docker >/dev/null 2>&1; then dnf install -y docker || yum install -y docker; fi",
      "systemctl enable --now docker",
      "mkdir -p /opt/shop-website",
      "cat > /tmp/shop-website.env.b64 <<'ENVEOF'",
      $EnvBase64,
      "ENVEOF",
      "base64 -d /tmp/shop-website.env.b64 > /opt/shop-website/.env",
      "chmod 600 /opt/shop-website/.env",
      "aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin $Registry",
      "docker pull $ImageUri",
      "docker stop shop-website || true",
      "docker rm shop-website || true",
      "docker run -d --name shop-website --restart unless-stopped --env-file /opt/shop-website/.env -p 80:3000 $ImageUri",
      "docker image prune -f"
    )
  }
  Write-JsonFile $commandsPath $commands

  $commandId = Invoke-AwsText @(
    "ssm", "send-command",
    "--instance-ids", $InstanceId,
    "--document-name", "AWS-RunShellScript",
    "--comment", "Deploy $ServiceName",
    "--parameters", "file://$commandsPath",
    "--query", "Command.CommandId"
  )

  for($attempt = 1; $attempt -le 60; $attempt++){
    $status = Invoke-AwsText @(
      "ssm", "get-command-invocation",
      "--command-id", $commandId,
      "--instance-id", $InstanceId,
      "--query", "Status"
    )
    Write-Host "Deploy command status: $status"

    if($status -eq "Success"){
      return
    }

    if($status -in @("Failed", "Cancelled", "TimedOut")){
      Invoke-AwsJson @("ssm", "get-command-invocation", "--command-id", $commandId, "--instance-id", $InstanceId) | ConvertTo-Json -Depth 10 | Write-Host
      throw "EC2 deploy command failed with status $status."
    }

    Start-Sleep -Seconds 10
  }

  throw "Timed out waiting for EC2 deploy command to finish."
}

function Get-InstancePublicUrl($InstanceId){
  $publicDns = Invoke-AwsText @("ec2", "describe-instances", "--instance-ids", $InstanceId, "--query", "Reservations[0].Instances[0].PublicDnsName")
  if($publicDns -and $publicDns -ne "None"){
    return "http://$publicDns"
  }

  $publicIp = Invoke-AwsText @("ec2", "describe-instances", "--instance-ids", $InstanceId, "--query", "Reservations[0].Instances[0].PublicIpAddress")
  return "http://$publicIp"
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

function Ensure-GitHubDeployRole($AccountId, $ProviderArn, $RepositoryArn, $InstanceId, $RepositoryName){
  $roleName = "$ServiceName-github-deploy"
  if($roleName.Length -gt 64){
    $roleName = $roleName.Substring(0, 64)
  }

  $trustPath = Join-Path ([System.IO.Path]::GetTempPath()) "$roleName-trust.json"
  $policyPath = Join-Path ([System.IO.Path]::GetTempPath()) "$roleName-policy.json"
  $sub = "repo:$RepositoryName`:ref:refs/heads/$Branch"
  $documentArn = "arn:aws:ssm:$Region`:*:document/AWS-RunShellScript"
  $instanceArn = "arn:aws:ec2:$Region`:$AccountId`:instance/$InstanceId"
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
        Action = @("ecr:GetAuthorizationToken", "ecr:CreateRepository", "ecr:DescribeRepositories")
        Resource = "*"
      },
      @{
        Effect = "Allow"
        Action = @(
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
        Action = @("ssm:SendCommand")
        Resource = @($documentArn, $instanceArn)
      },
      @{
        Effect = "Allow"
        Action = @("ssm:GetCommandInvocation", "ssm:ListCommandInvocations", "ec2:DescribeInstances")
        Resource = "*"
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

function Set-GitHubConfiguration($RepositoryName, $DeployRoleArn, $InstanceId){
  if($SkipGitHubSecrets){
    return
  }

  Invoke-Native "gh" @("secret", "set", "AWS_ROLE_TO_ASSUME", "--body", $DeployRoleArn, "--repo", $RepositoryName)
  Invoke-Native "gh" @("variable", "set", "AWS_REGION", "--body", $Region, "--repo", $RepositoryName)
  Invoke-Native "gh" @("variable", "set", "ECR_REPOSITORY", "--body", $EcrRepository, "--repo", $RepositoryName)
  Invoke-Native "gh" @("variable", "set", "EC2_INSTANCE_ID", "--body", $InstanceId, "--repo", $RepositoryName)
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
  if(-not $runtimeEnv.ContainsKey($name) -or -not (Has-RealValue $runtimeEnv[$name])){
    throw "Missing or placeholder .env value: $name"
  }
}

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
$containerEnv = @{}
foreach($name in $allowedRuntimeEnv){
  if($runtimeEnv.ContainsKey($name) -and $runtimeEnv[$name]){
    $containerEnv[$name] = $runtimeEnv[$name]
  }
}
$containerEnv["NODE_ENV"] = "production"
$containerEnv["AWS_REGION"] = $Region
$containerEnv["AWS_S3_BUCKET"] = $s3BucketName
$containerEnv["AWS_S3_KEY_PREFIX"] = $keyPrefix
$envBase64 = ConvertTo-EnvFileBase64 $containerEnv

Write-Host "AWS account: $accountId"
Write-Host "GitHub repo: $repositoryName"
Write-Host "Region: $Region"
Write-Host "S3 bucket: $s3BucketName"

$repository = Ensure-EcrRepository
$repositoryUri = $repository.repositoryUri
$repositoryArn = $repository.repositoryArn

Ensure-S3Bucket $s3BucketName $keyPrefix
Push-InitialImage $registry $repositoryUri

$profileName = Ensure-Ec2InstanceProfile $repositoryArn $s3BucketName $keyPrefix
$resolvedVpcId = Resolve-VpcId
$resolvedSubnetId = Resolve-SubnetId $resolvedVpcId
$securityGroupId = Ensure-SecurityGroup $resolvedVpcId
$resolvedAmiId = Resolve-AmiId
$instanceId = Ensure-Ec2Instance $profileName $securityGroupId $resolvedSubnetId $resolvedAmiId $envBase64 $registry $repositoryUri

Wait-InstanceRunning $instanceId
Wait-SsmOnline $instanceId
Invoke-Ec2Deploy $instanceId $envBase64 $registry "$repositoryUri`:latest"

$providerArn = Ensure-GitHubOidcProvider $accountId
$deployRoleArn = Ensure-GitHubDeployRole $accountId $providerArn $repositoryArn $instanceId $repositoryName
Set-GitHubConfiguration $repositoryName $deployRoleArn $instanceId

$publicUrl = Get-InstancePublicUrl $instanceId

Write-Host ""
Write-Host "AWS EC2 bootstrap complete."
Write-Host "Public URL: $publicUrl"
Write-Host "EC2 instance: $instanceId"
Write-Host "ECR image: $repositoryUri`:latest"
Write-Host "S3 bucket: $s3BucketName"
Write-Host "GitHub deploy role: $deployRoleArn"
