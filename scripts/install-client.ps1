#Requires -RunAsAdministrator
param([Parameter(Mandatory=$true)][string]$PublishDirectory)
$target='C:\Program Files\CentroComputo';$data='C:\ProgramData\CentroComputo'
if(-not (Test-Path -LiteralPath $PublishDirectory)){throw "No existe el directorio publicado: $PublishDirectory"}
New-Item -ItemType Directory -Force -Path $target,$data,(Join-Path $data 'logs') | Out-Null
Get-ChildItem -LiteralPath $PublishDirectory | Copy-Item -Destination $target -Recurse -Force
$agent=Join-Path $target 'CentroComputo.Agent.exe';$client=Join-Path $target 'ClienteCentroComputo.exe'
if(Test-Path -LiteralPath $agent){& sc.exe create CentroComputoAgent binPath= $agent start= auto DisplayName= 'CentroComputo Agent';& sc.exe failure CentroComputoAgent reset= 86400 actions= restart/5000; & sc.exe start CentroComputoAgent}
$taskAction=New-ScheduledTaskAction -Execute $client
$taskTrigger=New-ScheduledTaskTrigger -AtLogOn
$principal=New-ScheduledTaskPrincipal -GroupId 'BUILTIN\Users' -RunLevel Highest
Register-ScheduledTask -TaskName 'CentroComputo Client' -Action $taskAction -Trigger $taskTrigger -Principal $principal -Force | Out-Null
Write-Host 'Cliente instalado. La configuración inicial aparecerá en el siguiente inicio de sesión.'
