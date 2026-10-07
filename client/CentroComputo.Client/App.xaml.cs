using System.Windows;
using CentroComputo.Core;
namespace CentroComputo.Client;
public partial class App:Application
{
    protected override async void OnStartup(StartupEventArgs e){base.OnStartup(e);var store=new ConfigStore();var config=await store.LoadAsync();if(config is null){var setup=new SetupWindow(store);if(setup.ShowDialog()!=true){Shutdown();return;}config=await store.LoadAsync();}var http=new HttpClient{Timeout=TimeSpan.FromSeconds(8)};var client=new ServerClient(http,store);var window=new LockWindow(config!,client);MainWindow=window;window.Show();_ = window.StartAsync();}
}
