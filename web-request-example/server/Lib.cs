using System.Diagnostics;
using Newtonsoft.Json;
using SpacetimeDB;

#pragma warning disable STDB_UNSTABLE

public static partial class Module
{
    [Table(Name = "KnownIdentities", Public = true)]
    public partial struct KnownIdentities
    {
        [PrimaryKey] public Identity Identity;
    }

    [Type]
    public enum RequestType
    {
        GET,
        POST
    }
    
    [Table(Name = "WebRequests", Public = true)]
    public partial struct WebRequest
    {
        [AutoInc] [PrimaryKey] public int Id;
        public RequestType RequestType;
        public string Uri;
        public string Payload;
    }
    
    [ClientVisibilityFilter]
    public static readonly Filter REQUEST_FILTER = new Filter.Sql(
        "SELECT WebRequests.* FROM WebRequests JOIN KnownIdentities WHERE KnownIdentities.Identity = :sender"
    );

    [Type]
    public partial struct HourlyUnits
    {
        public string time;
        public string temperature_2m;
    }

    [Type]
    public partial struct Hourly
    {
        public List<long> time;
        public List<double> temperature_2m;
    }

    [Table(Name = "Weather", Public = true)]
    public partial struct Weather
    {
        [AutoInc] [PrimaryKey] public int Id;
        public double latitude;
        public double longitude;
        public double generationtime_ms;
        public int utc_offset_seconds;
        public string timezone;
        public string timezone_abbreviation;
        public double elevation;
        public HourlyUnits hourly_units;
        public Hourly hourly;
    }

    [Reducer(ReducerKind.Init)]
    public static void Init(ReducerContext ctx)
    {
        if (ctx.Db.KnownIdentities.Identity.Find(ctx.Sender) is null)
        {
            ctx.Db.KnownIdentities.Insert(new KnownIdentities
            {
                Identity = ctx.Sender
            });
            Log.Info($"Owner added to known Identities: {ctx.Sender}");
        }
    }

    [Reducer(ReducerKind.ClientConnected)]
    public static void ClientConnected(ReducerContext ctx)
    {
        Log.Info($"ClientConnected - {ctx.Sender}");
    }
    
    private const string WEATHER_API_BASE_URL = "https://api.open-meteo.com/v1/forecast?";

    [Reducer]
    public static void RequestWeather(ReducerContext ctx, string latitude, string longitude)
    {
        var options =
            "&hourly=temperature_2m&forecast_days=1&timeformat=unixtime&wind_speed_unit=mph&temperature_unit=fahrenheit&precipitation_unit=inch";

        ctx.Db.WebRequests.Insert(new WebRequest
        {
            Id = 0,
            RequestType = RequestType.GET,
            Uri = WEATHER_API_BASE_URL + "latitude=" + latitude + "&longitude=" + longitude + options,
            Payload = ""
        });
    }

    [Reducer]
    public static void ReturnWeather(ReducerContext ctx, string response)
    {
        if (ctx.Db.KnownIdentities.Identity.Find(ctx.Sender) is null)
            throw new Exception("Invalid identity attempted to ReturnWeather!");
        
        Weather data = JsonConvert.DeserializeObject<Weather>(response);
        ctx.Db.Weather.Insert(data);

        foreach (var request in ctx.Db.WebRequests.Iter())
        {
            ctx.Db.WebRequests.Delete(request);
        }
    }

    [Reducer]
    public static void ClearWeather(ReducerContext ctx)
    {
        foreach (var w in ctx.Db.Weather.Iter())
        {
            ctx.Db.Weather.Delete(w);
        }
        Log.Warn($"{ctx.Sender} has cleared the weather!");
    }

    [Reducer]
    public static void AddKnownIdentity(ReducerContext ctx, string identity)
    {
        if (ctx.Db.KnownIdentities.Identity.Find(ctx.Sender) is null)
            throw new Exception("Invalid identity attempted to add KnownIdentity!");

        ctx.Db.KnownIdentities.Insert(new KnownIdentities
        {
            Identity = Identity.FromHexString(identity)
        });
    }
    
    
}
