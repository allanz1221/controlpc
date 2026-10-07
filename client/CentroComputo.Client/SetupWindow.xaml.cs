using System.Windows;using CentroComputo.Core;
namespace CentroComputo.Client;
public partial class SetupWindow:Window{private readonly ConfigStore store;public SetupWindow(ConfigStore store){InitializeComponent();this.store=store;}private async void Save_Click(object sender,RoutedEventArgs e){var value=new ClientConfig(Server.Text.Trim(),Computer.Text.Trim(),Room.Text.Trim(),RegistrationSecret:Secret.Password);if(!value.IsValid){Error.Text="Completa los datos con una dirección válida (incluye https://).";return;}await store.SaveAsync(value);DialogResult=true;}}
