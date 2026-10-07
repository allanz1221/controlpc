using System.Text.Json;
namespace CentroComputo.Core;
public sealed class ConfigStore
{
    public static readonly string BaseDirectory=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),"CentroComputo");
    public string ConfigPath=>Path.Combine(BaseDirectory,"config.json");
    public string QueuePath=>Path.Combine(BaseDirectory,"offline-events.jsonl");
    private static readonly JsonSerializerOptions Json=new(JsonSerializerDefaults.Web){WriteIndented=true};
    public async Task<ClientConfig?> LoadAsync(){try{if(!File.Exists(ConfigPath))return null;var value=JsonSerializer.Deserialize<ClientConfig>(await File.ReadAllTextAsync(ConfigPath),Json);return value?.IsValid==true?value:null;}catch{return null;}}
    public async Task SaveAsync(ClientConfig value){Directory.CreateDirectory(BaseDirectory);var temp=ConfigPath+".tmp";await File.WriteAllTextAsync(temp,JsonSerializer.Serialize(value,Json));File.Move(temp,ConfigPath,true);}
    public async Task EnqueueAsync(OfflineEvent item){Directory.CreateDirectory(BaseDirectory);await File.AppendAllTextAsync(QueuePath,JsonSerializer.Serialize(item,Json)+Environment.NewLine);}
    public async Task<IReadOnlyList<OfflineEvent>> ReadQueueAsync(){if(!File.Exists(QueuePath))return[];var rows=new List<OfflineEvent>();foreach(var line in await File.ReadAllLinesAsync(QueuePath)){try{var e=JsonSerializer.Deserialize<OfflineEvent>(line,Json);if(e is not null)rows.Add(e);}catch{}}return rows;}
    public async Task RemoveAcceptedAsync(IEnumerable<Guid> ids){var accepted=ids.ToHashSet();var remaining=(await ReadQueueAsync()).Where(e=>!accepted.Contains(e.Id));await File.WriteAllLinesAsync(QueuePath,remaining.Select(e=>JsonSerializer.Serialize(e,Json)));}
}
