using System.Text.Json.Serialization;
namespace CentroComputo.Core;
public sealed record ClientConfig(string Server,string ComputerName,string Room,string? ComputerId=null,string? ClientToken=null,string? RegistrationSecret=null){[JsonIgnore] public bool IsRegistered=>Guid.TryParse(ComputerId,out _)&&!string.IsNullOrWhiteSpace(ClientToken);public bool IsValid=>Uri.TryCreate(Server,UriKind.Absolute,out _)&&!string.IsNullOrWhiteSpace(ComputerName)&&!string.IsNullOrWhiteSpace(Room);}
public sealed record ClientSettings(int HeartbeatSeconds=10,int IdleMinutes=5,int ScreenshotSeconds=3);
public sealed record OfflineEvent(Guid Id,string Type,string StudentNumber,DateTimeOffset Timestamp,string? SessionId=null);
public sealed record RemoteCommand(Guid Id,string Type,Dictionary<string,string>? Payload);
public enum ComputerStatus { OFFLINE,LOCKED,IN_SESSION,IDLE,ERROR,UPDATING,UPDATE_FAILED }
