using Microsoft.Extensions.DependencyInjection;using Microsoft.Extensions.Hosting;
var builder=Host.CreateApplicationBuilder(args);builder.Services.AddWindowsService(o=>o.ServiceName="CentroComputo Agent");builder.Services.AddHostedService<AgentWorker>();await builder.Build().RunAsync();
sealed class AgentWorker(ILogger<AgentWorker> log):BackgroundService{protected override async Task ExecuteAsync(CancellationToken stoppingToken){log.LogInformation("Agente institucional iniciado");while(!stoppingToken.IsCancellationRequested){await Task.Delay(TimeSpan.FromSeconds(30),stoppingToken);}}}
